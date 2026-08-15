/**
 * The two scroll-driven scenes, rendered per frame from a 0..1 progress value.
 *
 * Palette is locked to the BVCITS brand (navy / crimson / gold) so the frames
 * sit inside the existing design system instead of next to it.
 */

import {
  addLine, addPoint, clearFramebuffer, clamp01, createRandom, easeInOut, easeOut,
  fillRadialGradient, hexToLinear, lerp, mixColor, project, rotateXYZ, stage, vec3,
} from "./render3d.mjs";
import {
  createCorridorGates, createDustField, createIcosphere, createOrbitRing,
} from "./geometry.mjs";

const BRAND = {
  navyDeep: hexToLinear("#04102b"),
  navy: hexToLinear("#072153"),
  blue: hexToLinear("#2981BA"),
  crimson: hexToLinear("#AE152D"),
  crimsonHot: hexToLinear("#e04a63"),
  gold: hexToLinear("#F2B51D"),
  goldPale: hexToLinear("#fbe9c6"),
  white: [1, 1, 1],
};

const CAMERA_FOV = 0.92;

/* ================================================================== */
/* Scene 1 — "Knowledge Core" (hero)                                   */
/* ================================================================== */

const CORE = {
  subdivisions: 2,
  baseRadius: 1.32,
  nodePixelScale: 0.013,
  nodeRadiusRange: [1.1, 8],
  edgePixelRadius: 1.15,
  dustCount: 420,
  ringSpecs: [
    { count: 110, radius: 2.05, tiltX: 1.18, tiltZ: 0.22, speed: 1.0 },
    { count: 92, radius: 2.45, tiltX: -0.78, tiltZ: 0.95, speed: -0.72 },
    { count: 76, radius: 2.85, tiltX: 0.42, tiltZ: -1.15, speed: 0.52 },
  ],
};

/** Built once and reused across every frame — geometry never changes. */
export function createCoreScene() {
  const sphere = createIcosphere(CORE.subdivisions);
  const random = createRandom(0x5eed);

  // Per-edge assembly order + per-node character, stable across frames.
  const edgeOrder = sphere.edges.map(() => random());
  const nodeSeed = sphere.vertices.map(() => random());

  const rings = CORE.ringSpecs.map((spec) =>
    createOrbitRing({
      count: spec.count,
      radius: spec.radius,
      tiltX: spec.tiltX,
      tiltZ: spec.tiltZ,
    }).map((p) => ({ ...p, speed: spec.speed, twinkle: random() })),
  );

  const dust = createDustField({ count: CORE.dustCount, spread: 11, depth: 8, seed: 0xbeef });

  return { sphere, edgeOrder, nodeSeed, rings, dust };
}

export function renderCoreFrame(fb, scene, progress) {
  const { width, height } = fb;
  const p = clamp01(progress);

  clearFramebuffer(fb);
  fillRadialGradient(fb, {
    inner: BRAND.navy.map((c) => c * 0.42),
    outer: [0.006, 0.010, 0.026],
    centerY: 0.44,
    radius: 0.74,
  });

  // --- Timeline -----------------------------------------------------
  // Starts part-built so the opening frame still reads as a lattice behind the
  // hero copy, then knits closed over the first third of the scroll.
  const assembly = lerp(0.45, 1, easeOut(stage(p, 0.0, 0.32)));
  const expansion = easeInOut(stage(p, 0.68, 1.0)); // core opens up at the end
  const spin = p * Math.PI * 2.15;
  const tilt = Math.sin(p * Math.PI) * 0.38 - 0.12;

  // Push in through the middle, then pull back wide enough to frame the
  // expanded core without cropping it.
  const distance = p < 0.55
    ? lerp(4.95, 3.15, easeInOut(stage(p, 0, 0.55)))
    : lerp(3.15, 5.75, easeInOut(stage(p, 0.55, 1)));
  const camera = { distance, fov: CAMERA_FOV };

  const radius = CORE.baseRadius * (1 + expansion * 0.30);

  drawDust(fb, scene.dust, camera, spin * 0.16, p);
  drawOrbitRings(fb, scene, camera, p, expansion);
  drawCoreEdges(fb, scene, camera, { spin, tilt, radius, assembly, expansion });
  drawCoreNodes(fb, scene, camera, { spin, tilt, radius, assembly, expansion, p });
}

function coreVertexPosition(vertex, seed, { spin, tilt, radius, expansion }) {
  // During expansion each node drifts outward by its own amount, so the shell
  // "breathes" apart rather than scaling uniformly.
  const drift = 1 + expansion * (seed - 0.5) * 0.5;
  const scaled = vec3(vertex.x * radius * drift, vertex.y * radius * drift, vertex.z * radius * drift);
  return rotateXYZ(scaled, tilt, spin, 0);
}

function drawCoreEdges(fb, scene, camera, params) {
  const { sphere, edgeOrder, nodeSeed } = scene;
  const { assembly } = params;

  for (let i = 0; i < sphere.edges.length; i++) {
    // Each edge has its own slot in the assembly ramp.
    const reveal = clamp01((assembly - edgeOrder[i] * 0.72) / 0.28);
    if (reveal <= 0.01) continue;

    const [a, b] = sphere.edges[i];
    const pa = coreVertexPosition(sphere.vertices[a], nodeSeed[a], params);
    const pb = coreVertexPosition(sphere.vertices[b], nodeSeed[b], params);
    const sa = project(pa, camera, fb.width, fb.height);
    const sb = project(pb, camera, fb.width, fb.height);
    if (!sa || !sb) continue;

    const facing = clamp01((pa.z + pb.z) / 2 / 1.8 + 0.5); // front edges read warmer
    const color = mixColor(BRAND.crimson, BRAND.gold, facing * 0.8);
    const intensity = reveal * lerp(0.16, 0.62, facing);
    addLine(fb, sa.x, sa.y, sb.x, sb.y, CORE.edgePixelRadius, color, intensity);
  }
}

function drawCoreNodes(fb, scene, camera, params) {
  const { sphere, nodeSeed } = scene;
  const { assembly, p } = params;
  const [minRadius, maxRadius] = CORE.nodeRadiusRange;

  for (let i = 0; i < sphere.vertices.length; i++) {
    const reveal = clamp01((assembly - nodeSeed[i] * 0.55) / 0.35);
    if (reveal <= 0.01) continue;

    const world = coreVertexPosition(sphere.vertices[i], nodeSeed[i], params);
    const screen = project(world, camera, fb.width, fb.height);
    if (!screen) continue;

    const facing = clamp01(world.z / 1.9 + 0.5);
    const pulse = 0.82 + 0.18 * Math.sin(p * Math.PI * 6 + nodeSeed[i] * Math.PI * 2);
    const radius = Math.min(maxRadius, Math.max(minRadius, screen.scale * CORE.nodePixelScale));

    const color = mixColor(mixColor(BRAND.blue, BRAND.gold, facing), BRAND.white, facing * facing * 0.55);
    addPoint(fb, screen.x, screen.y, radius, color, reveal * lerp(0.25, 1.15, facing) * pulse);
    // Wider, dimmer halo sells the glow without a real blur pass.
    addPoint(fb, screen.x, screen.y, radius * 3.2, color, reveal * lerp(0.04, 0.16, facing) * pulse);
  }
}

function drawOrbitRings(fb, scene, camera, p, expansion) {
  for (let r = 0; r < scene.rings.length; r++) {
    const ring = scene.rings[r];
    for (const particle of ring) {
      const angle = particle.angle + p * Math.PI * 2 * particle.speed;
      const ringRadius = particle.radius * (1 + expansion * 0.18);
      const flat = vec3(Math.cos(angle) * ringRadius, 0, Math.sin(angle) * ringRadius);
      const world = rotateXYZ(flat, particle.tiltX, p * 0.7, particle.tiltZ);
      const screen = project(world, camera, fb.width, fb.height);
      if (!screen) continue;

      const facing = clamp01(world.z / 3 + 0.5);
      const twinkle = 0.5 + 0.5 * Math.sin(p * Math.PI * 8 + particle.twinkle * Math.PI * 2);
      const color = mixColor(BRAND.blue, BRAND.goldPale, facing * 0.85);
      const radius = Math.max(1.0, screen.scale * 0.0072);
      addPoint(fb, screen.x, screen.y, radius, color, lerp(0.16, 0.88, facing) * (0.55 + 0.45 * twinkle));
      addPoint(fb, screen.x, screen.y, radius * 3, color, lerp(0.02, 0.10, facing));
    }
  }
}

function drawDust(fb, dust, camera, drift, p) {
  for (const speck of dust) {
    const world = rotateXYZ(speck.position, 0, drift, 0);
    const screen = project(world, camera, fb.width, fb.height);
    if (!screen) continue;
    const twinkle = 0.6 + 0.4 * Math.sin(p * Math.PI * 4 + speck.brightness * 10);
    addPoint(fb, screen.x, screen.y, 1.0, BRAND.blue, speck.brightness * 0.14 * twinkle);
  }
}

/* ================================================================== */
/* Scene 2 — "Corridor" (departments flythrough)                       */
/* ================================================================== */

const CORRIDOR = {
  gateCount: 46,
  spacing: 1.55,
  radius: 2.6,
  sides: 6,
  twistPerGate: 0.085,
  travelGates: 34, // how many gates the camera passes across the full scroll
  streamCount: 320,
};

export function createCorridorScene() {
  const gates = createCorridorGates({
    count: CORRIDOR.gateCount,
    spacing: CORRIDOR.spacing,
    radius: CORRIDOR.radius,
    twistPerGate: CORRIDOR.twistPerGate,
    sides: CORRIDOR.sides,
  });

  const random = createRandom(0xc0ffee);
  const streams = Array.from({ length: CORRIDOR.streamCount }, () => ({
    angle: random() * Math.PI * 2,
    radius: 0.55 + random() * 2.2,
    z: -random() * CORRIDOR.gateCount * CORRIDOR.spacing,
    speed: 0.4 + random() * 1.5,
    brightness: 0.35 + random() * 0.65,
  }));

  return { gates, streams };
}

export function renderCorridorFrame(fb, scene, progress) {
  const p = clamp01(progress);

  clearFramebuffer(fb);
  fillRadialGradient(fb, {
    inner: BRAND.navy.map((c) => c * 0.34),
    outer: [0.004, 0.006, 0.014],
    centerY: 0.5,
    radius: 0.72,
  });

  const travel = p * CORRIDOR.travelGates * CORRIDOR.spacing;
  const cameraZ = 1.6 - travel;
  const camera = { distance: cameraZ, fov: CAMERA_FOV };
  // Gentle bank so the flight feels piloted rather than on rails.
  const bank = Math.sin(p * Math.PI * 2.6) * 0.14;
  const driftX = Math.sin(p * Math.PI * 1.7) * 0.3;
  const driftY = Math.cos(p * Math.PI * 2.1) * 0.22;

  drawVanishingPoint(fb, camera, { p, bank, driftX, driftY, cameraZ });
  drawCorridorStreams(fb, scene, camera, { p, bank, driftX, driftY });
  drawCorridorGates(fb, scene, camera, { p, bank, driftX, driftY, cameraZ });
}

/** Soft glow down the tunnel axis — the single strongest depth cue here. */
function drawVanishingPoint(fb, camera, params) {
  const far = vec3(0, 0, params.cameraZ - 26);
  const screen = project(corridorTransform(far, params), camera, fb.width, fb.height);
  if (!screen) return;

  const breathe = 0.8 + 0.2 * Math.sin(params.p * Math.PI * 3);
  const scale = Math.min(fb.width, fb.height);
  addPoint(fb, screen.x, screen.y, scale * 0.22, mixColor(BRAND.navy, BRAND.blue, 0.5), 0.16 * breathe);
  addPoint(fb, screen.x, screen.y, scale * 0.075, mixColor(BRAND.blue, BRAND.goldPale, 0.35), 0.20 * breathe);
  addPoint(fb, screen.x, screen.y, scale * 0.022, BRAND.goldPale, 0.28 * breathe);
}

function corridorTransform(point, { bank, driftX, driftY }) {
  const banked = rotateXYZ(vec3(point.x - driftX, point.y - driftY, point.z), 0, 0, bank);
  return banked;
}

function drawCorridorGates(fb, scene, camera, params) {
  const { cameraZ } = params;

  for (const gate of scene.gates) {
    const depth = cameraZ - gate.corners[0].z;
    if (depth <= 0.35 || depth > 34) continue;

    // Fade in at the far end, flare out as it sweeps past the camera.
    const farFade = clamp01((34 - depth) / 14);
    const nearFade = clamp01((depth - 0.35) / 2.4);
    const alpha = farFade * nearFade;
    if (alpha <= 0.01) continue;

    const accent = gate.index % 4 === 0;
    const color = accent
      ? mixColor(BRAND.gold, BRAND.white, 0.25)
      : mixColor(BRAND.crimson, BRAND.blue, 0.45 + 0.35 * Math.sin(gate.index * 0.6));
    const lineIntensity = alpha * (accent ? 0.72 : 0.34);

    const projected = gate.corners.map((corner) =>
      project(corridorTransform(corner, params), camera, fb.width, fb.height),
    );

    for (let i = 0; i < projected.length; i++) {
      const from = projected[i];
      const to = projected[(i + 1) % projected.length];
      if (!from || !to) continue;
      addLine(fb, from.x, from.y, to.x, to.y, accent ? 1.5 : 1.1, color, lineIntensity);
    }

    // Corner nodes give the gates weight.
    for (const corner of projected) {
      if (!corner) continue;
      const radius = Math.max(1, Math.min(7, corner.scale * 0.014));
      addPoint(fb, corner.x, corner.y, radius, mixColor(color, BRAND.white, 0.4), alpha * (accent ? 0.95 : 0.4));
      addPoint(fb, corner.x, corner.y, radius * 3, color, alpha * (accent ? 0.14 : 0.06));
    }
  }
}

function drawCorridorStreams(fb, scene, camera, params) {
  const { p } = params;
  const loopLength = CORRIDOR.gateCount * CORRIDOR.spacing;

  for (const stream of scene.streams) {
    // Wrap each speck through the corridor so density stays constant.
    const z = ((stream.z + p * stream.speed * 12) % loopLength) - loopLength;
    const angle = stream.angle + p * 0.6;
    const world = vec3(Math.cos(angle) * stream.radius, Math.sin(angle) * stream.radius, z);
    const screen = project(corridorTransform(world, params), camera, fb.width, fb.height);
    if (!screen) continue;

    const depth = screen.depth;
    if (depth > 30) continue;
    const fade = clamp01((30 - depth) / 12) * clamp01((depth - 0.3) / 1.5);
    const radius = Math.max(1.0, Math.min(5, screen.scale * 0.0055));
    const color = mixColor(BRAND.blue, BRAND.goldPale, clamp01(1 - depth / 12));
    addPoint(fb, screen.x, screen.y, radius, color, fade * stream.brightness * 1.15);
    addPoint(fb, screen.x, screen.y, radius * 3.5, color, fade * stream.brightness * 0.12);
  }
}
