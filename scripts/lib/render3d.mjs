/**
 * Minimal software 3D renderer used to pre-render scroll frame sequences.
 *
 * Design notes:
 * - Accumulation buffer is Float32 RGB with *additive* blending, so draw order
 *   never matters and no depth buffer is required for glow-style geometry.
 * - Tone mapping happens once per frame (filmic rolloff + gamma), which is what
 *   makes bright cores bloom to white instead of clipping to flat colour.
 * - No dependencies. Output is a raw RGB buffer that `sharp` encodes to JPEG.
 */

const BLOOM_DOWNSCALE = 4;
const BLOOM_BLUR_PASSES = 3;
const SPLAT_FALLOFF = 2.5; // gaussian tightness for point/line splats
const NEAR_PLANE = 0.05;

/* ------------------------------------------------------------------ */
/* Vector + matrix helpers                                             */
/* ------------------------------------------------------------------ */

export const vec3 = (x, y, z) => ({ x, y, z });

export function normalize(v) {
  const len = Math.hypot(v.x, v.y, v.z) || 1;
  return vec3(v.x / len, v.y / len, v.z / len);
}

export function scaleVec(v, s) {
  return vec3(v.x * s, v.y * s, v.z * s);
}

export function addVec(a, b) {
  return vec3(a.x + b.x, a.y + b.y, a.z + b.z);
}

export function lerpVec(a, b, t) {
  return vec3(a.x + (b.x - a.x) * t, a.y + (b.y - a.y) * t, a.z + (b.z - a.z) * t);
}

/** Rotate around X, then Y, then Z. Angles in radians. */
export function rotateXYZ(v, rx, ry, rz) {
  const cosX = Math.cos(rx), sinX = Math.sin(rx);
  const y1 = v.y * cosX - v.z * sinX;
  const z1 = v.y * sinX + v.z * cosX;

  const cosY = Math.cos(ry), sinY = Math.sin(ry);
  const x2 = v.x * cosY + z1 * sinY;
  const z2 = -v.x * sinY + z1 * cosY;

  const cosZ = Math.cos(rz), sinZ = Math.sin(rz);
  return vec3(x2 * cosZ - y1 * sinZ, x2 * sinZ + y1 * cosZ, z2);
}

/* ------------------------------------------------------------------ */
/* Easing                                                              */
/* ------------------------------------------------------------------ */

export const clamp01 = (t) => (t < 0 ? 0 : t > 1 ? 1 : t);
export const lerp = (a, b, t) => a + (b - a) * t;
export const easeInOut = (t) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);
export const easeOut = (t) => 1 - Math.pow(1 - t, 3);

/** Maps `t` from range [inA,inB] to 0..1, clamped. Handy for staged animation. */
export const stage = (t, inA, inB) => clamp01((t - inA) / (inB - inA || 1));

/* ------------------------------------------------------------------ */
/* Framebuffer                                                         */
/* ------------------------------------------------------------------ */

export function createFramebuffer(width, height) {
  return { width, height, data: new Float32Array(width * height * 3) };
}

export function clearFramebuffer(fb) {
  fb.data.fill(0);
}

/**
 * Fills the buffer with a radial gradient — the "studio backdrop" every scene
 * sits on. `inner`/`outer` are [r,g,b] in 0..1 linear space.
 */
export function fillRadialGradient(fb, { inner, outer, centerX = 0.5, centerY = 0.45, radius = 0.85 }) {
  const { width, height, data } = fb;
  const cx = centerX * width;
  const cy = centerY * height;
  const maxDist = radius * Math.hypot(width, height);

  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const t = clamp01(Math.hypot(x - cx, y - cy) / maxDist);
      const smooth = t * t * (3 - 2 * t);
      const i = (y * width + x) * 3;
      data[i] = lerp(inner[0], outer[0], smooth);
      data[i + 1] = lerp(inner[1], outer[1], smooth);
      data[i + 2] = lerp(inner[2], outer[2], smooth);
    }
  }
}

/* ------------------------------------------------------------------ */
/* Projection                                                          */
/* ------------------------------------------------------------------ */

/**
 * Pinhole projection. The camera sits at +Z looking back at the origin.
 * Returns null when the point falls behind the near plane.
 */
export function project(point, camera, width, height) {
  const viewZ = camera.distance - point.z;
  if (viewZ <= NEAR_PLANE) return null;

  const focal = height / 2 / Math.tan(camera.fov / 2);
  const scale = focal / viewZ;
  return {
    x: width / 2 + point.x * scale,
    y: height / 2 - point.y * scale,
    depth: viewZ,
    scale,
  };
}

/* ------------------------------------------------------------------ */
/* Rasterisation (additive splats)                                     */
/* ------------------------------------------------------------------ */

/** Additive gaussian splat. `radius` is in pixels, `color` is [r,g,b] 0..1. */
export function addPoint(fb, x, y, radius, color, intensity) {
  if (intensity <= 0 || radius <= 0) return;
  const { width, height, data } = fb;

  const minX = Math.max(0, Math.floor(x - radius));
  const maxX = Math.min(width - 1, Math.ceil(x + radius));
  const minY = Math.max(0, Math.floor(y - radius));
  const maxY = Math.min(height - 1, Math.ceil(y + radius));
  if (minX > maxX || minY > maxY) return;

  const invR2 = 1 / (radius * radius);
  for (let py = minY; py <= maxY; py++) {
    const dy = py - y;
    for (let px = minX; px <= maxX; px++) {
      const dx = px - x;
      const falloff = Math.exp(-SPLAT_FALLOFF * (dx * dx + dy * dy) * invR2);
      if (falloff < 0.004) continue;
      const weight = falloff * intensity;
      const i = (py * width + px) * 3;
      data[i] += color[0] * weight;
      data[i + 1] += color[1] * weight;
      data[i + 2] += color[2] * weight;
    }
  }
}

/**
 * Draws a line by walking it and splatting. Slower than Bresenham but gives
 * free anti-aliasing, thickness and glow — which is the whole look.
 */
export function addLine(fb, x0, y0, x1, y1, radius, color, intensity) {
  if (intensity <= 0) return;
  const dx = x1 - x0;
  const dy = y1 - y0;
  const length = Math.hypot(dx, dy);
  if (length < 0.001) {
    addPoint(fb, x0, y0, radius, color, intensity);
    return;
  }

  // Splat every ~0.6px so coverage stays continuous without over-drawing.
  const steps = Math.max(1, Math.ceil(length / 0.6));
  // Normalise so a long line isn't brighter than a short one.
  const perStep = intensity * (0.6 / Math.max(0.6, radius)) * 0.85;

  for (let s = 0; s <= steps; s++) {
    const t = s / steps;
    addPoint(fb, x0 + dx * t, y0 + dy * t, radius, color, perStep);
  }
}

/* ------------------------------------------------------------------ */
/* Bloom + tone mapping                                                */
/* ------------------------------------------------------------------ */

function extractBright(fb, threshold) {
  const w = Math.max(1, Math.floor(fb.width / BLOOM_DOWNSCALE));
  const h = Math.max(1, Math.floor(fb.height / BLOOM_DOWNSCALE));
  const out = new Float32Array(w * h * 3);

  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      let r = 0, g = 0, b = 0;
      for (let sy = 0; sy < BLOOM_DOWNSCALE; sy++) {
        for (let sx = 0; sx < BLOOM_DOWNSCALE; sx++) {
          const srcX = Math.min(fb.width - 1, x * BLOOM_DOWNSCALE + sx);
          const srcY = Math.min(fb.height - 1, y * BLOOM_DOWNSCALE + sy);
          const i = (srcY * fb.width + srcX) * 3;
          r += fb.data[i];
          g += fb.data[i + 1];
          b += fb.data[i + 2];
        }
      }
      const n = BLOOM_DOWNSCALE * BLOOM_DOWNSCALE;
      r /= n; g /= n; b /= n;
      const excess = Math.max(0, Math.max(r, Math.max(g, b)) - threshold);
      const gain = excess > 0 ? excess / Math.max(r, Math.max(g, b, 1e-6)) : 0;
      const o = (y * w + x) * 3;
      out[o] = r * gain;
      out[o + 1] = g * gain;
      out[o + 2] = b * gain;
    }
  }
  return { width: w, height: h, data: out };
}

function boxBlur(buf) {
  const { width, height, data } = buf;
  const tmp = new Float32Array(data.length);

  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const left = Math.max(0, x - 1), right = Math.min(width - 1, x + 1);
      const o = (y * width + x) * 3;
      for (let c = 0; c < 3; c++) {
        tmp[o + c] =
          (data[(y * width + left) * 3 + c] + data[o + c] + data[(y * width + right) * 3 + c]) / 3;
      }
    }
  }
  for (let y = 0; y < height; y++) {
    const up = Math.max(0, y - 1), down = Math.min(height - 1, y + 1);
    for (let x = 0; x < width; x++) {
      const o = (y * width + x) * 3;
      for (let c = 0; c < 3; c++) {
        data[o + c] =
          (tmp[(up * width + x) * 3 + c] + tmp[o + c] + tmp[(down * width + x) * 3 + c]) / 3;
      }
    }
  }
  return buf;
}

function sampleBilinear(buf, u, v, channel) {
  const x = Math.min(buf.width - 1, Math.max(0, u * buf.width - 0.5));
  const y = Math.min(buf.height - 1, Math.max(0, v * buf.height - 0.5));
  const x0 = Math.floor(x), y0 = Math.floor(y);
  const x1 = Math.min(buf.width - 1, x0 + 1), y1 = Math.min(buf.height - 1, y0 + 1);
  const fx = x - x0, fy = y - y0;

  const at = (px, py) => buf.data[(py * buf.width + px) * 3 + channel];
  const top = lerp(at(x0, y0), at(x1, y0), fx);
  const bottom = lerp(at(x0, y1), at(x1, y1), fx);
  return lerp(top, bottom, fy);
}

/**
 * Applies bloom, filmic tone mapping and gamma, returning an 8-bit RGB buffer
 * ready for `sharp`.
 */
export function toneMap(fb, { exposure = 1.0, gamma = 2.2, bloomStrength = 0.55, bloomThreshold = 0.5 } = {}) {
  let bloom = null;
  if (bloomStrength > 0) {
    bloom = extractBright(fb, bloomThreshold);
    for (let i = 0; i < BLOOM_BLUR_PASSES; i++) boxBlur(bloom);
  }

  const { width, height, data } = fb;
  const out = Buffer.allocUnsafe(width * height * 3);
  const invGamma = 1 / gamma;

  for (let y = 0; y < height; y++) {
    const v = (y + 0.5) / height;
    for (let x = 0; x < width; x++) {
      const u = (x + 0.5) / width;
      const i = (y * width + x) * 3;
      for (let c = 0; c < 3; c++) {
        let value = data[i + c];
        if (bloom) value += sampleBilinear(bloom, u, v, c) * bloomStrength;
        // Filmic rolloff — never clips, bright cores tend to white.
        const mapped = 1 - Math.exp(-value * exposure);
        out[i + c] = Math.round(clamp01(Math.pow(mapped, invGamma)) * 255);
      }
    }
  }
  return out;
}

/* ------------------------------------------------------------------ */
/* Colour helpers                                                      */
/* ------------------------------------------------------------------ */

/** Converts #rrggbb to a linear-space [r,g,b] triple. */
export function hexToLinear(hex) {
  const value = hex.replace("#", "");
  const toLinear = (srgb) => (srgb <= 0.04045 ? srgb / 12.92 : Math.pow((srgb + 0.055) / 1.055, 2.4));
  return [0, 1, 2].map((i) => toLinear(parseInt(value.slice(i * 2, i * 2 + 2), 16) / 255));
}

export function mixColor(a, b, t) {
  const k = clamp01(t);
  return [a[0] + (b[0] - a[0]) * k, a[1] + (b[1] - a[1]) * k, a[2] + (b[2] - a[2]) * k];
}

/* ------------------------------------------------------------------ */
/* Deterministic pseudo-random (so every render is identical)          */
/* ------------------------------------------------------------------ */

export function createRandom(seed) {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
