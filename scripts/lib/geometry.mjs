/**
 * Procedural geometry for the pre-rendered scroll scenes.
 * Everything returns plain {vertices, edges} data in unit-ish space.
 */

import { createRandom, normalize, vec3 } from "./render3d.mjs";

const GOLDEN_RATIO = (1 + Math.sqrt(5)) / 2;

const ICOSAHEDRON_VERTICES = [
  [-1, GOLDEN_RATIO, 0], [1, GOLDEN_RATIO, 0], [-1, -GOLDEN_RATIO, 0], [1, -GOLDEN_RATIO, 0],
  [0, -1, GOLDEN_RATIO], [0, 1, GOLDEN_RATIO], [0, -1, -GOLDEN_RATIO], [0, 1, -GOLDEN_RATIO],
  [GOLDEN_RATIO, 0, -1], [GOLDEN_RATIO, 0, 1], [-GOLDEN_RATIO, 0, -1], [-GOLDEN_RATIO, 0, 1],
];

const ICOSAHEDRON_FACES = [
  [0, 11, 5], [0, 5, 1], [0, 1, 7], [0, 7, 10], [0, 10, 11],
  [1, 5, 9], [5, 11, 4], [11, 10, 2], [10, 7, 6], [7, 1, 8],
  [3, 9, 4], [3, 4, 2], [3, 2, 6], [3, 6, 8], [3, 8, 9],
  [4, 9, 5], [2, 4, 11], [6, 2, 10], [8, 6, 7], [9, 8, 1],
];

/**
 * Geodesic sphere built by subdividing an icosahedron.
 * `subdivisions: 2` gives 162 vertices / 480 edges — dense enough to read as a
 * lattice, sparse enough that every edge stays legible at 1600px wide.
 */
export function createIcosphere(subdivisions = 2) {
  const vertices = ICOSAHEDRON_VERTICES.map(([x, y, z]) => normalize(vec3(x, y, z)));
  let faces = ICOSAHEDRON_FACES.map((f) => [...f]);

  const midpointCache = new Map();
  const midpointIndex = (a, b) => {
    const key = a < b ? `${a}_${b}` : `${b}_${a}`;
    const cached = midpointCache.get(key);
    if (cached !== undefined) return cached;

    const va = vertices[a];
    const vb = vertices[b];
    vertices.push(normalize(vec3((va.x + vb.x) / 2, (va.y + vb.y) / 2, (va.z + vb.z) / 2)));
    const index = vertices.length - 1;
    midpointCache.set(key, index);
    return index;
  };

  for (let pass = 0; pass < subdivisions; pass++) {
    const next = [];
    for (const [a, b, c] of faces) {
      const ab = midpointIndex(a, b);
      const bc = midpointIndex(b, c);
      const ca = midpointIndex(c, a);
      next.push([a, ab, ca], [b, bc, ab], [c, ca, bc], [ab, bc, ca]);
    }
    faces = next;
  }

  return { vertices, edges: uniqueEdges(faces) };
}

function uniqueEdges(faces) {
  const seen = new Set();
  const edges = [];
  for (const [a, b, c] of faces) {
    for (const [from, to] of [[a, b], [b, c], [c, a]]) {
      const key = from < to ? `${from}_${to}` : `${to}_${from}`;
      if (seen.has(key)) continue;
      seen.add(key);
      edges.push([from, to]);
    }
  }
  return edges;
}

/**
 * A tilted ring of particles — used for the orbital "academic rings" that
 * circle the knowledge core.
 */
export function createOrbitRing({ count, radius, tiltX, tiltZ, phase = 0 }) {
  const points = [];
  for (let i = 0; i < count; i++) {
    const angle = phase + (i / count) * Math.PI * 2;
    points.push({ angle, radius, tiltX, tiltZ });
  }
  return points;
}

/**
 * Field of background stars/dust. Deterministic so frames are reproducible.
 */
export function createDustField({ count, spread, depth, seed }) {
  const random = createRandom(seed);
  const points = [];
  for (let i = 0; i < count; i++) {
    points.push({
      position: vec3(
        (random() - 0.5) * spread,
        (random() - 0.5) * spread,
        (random() - 0.5) * depth,
      ),
      brightness: 0.25 + random() * 0.75,
    });
  }
  return points;
}

/**
 * Corridor rings for the flythrough scene: concentric square-ish frames
 * receding down -Z, each rotated slightly to create a twist.
 */
export function createCorridorGates({ count, spacing, radius, twistPerGate, sides }) {
  const gates = [];
  for (let i = 0; i < count; i++) {
    const corners = [];
    const twist = i * twistPerGate;
    for (let s = 0; s < sides; s++) {
      const angle = twist + (s / sides) * Math.PI * 2;
      corners.push(vec3(Math.cos(angle) * radius, Math.sin(angle) * radius, -i * spacing));
    }
    gates.push({ corners, index: i });
  }
  return gates;
}
