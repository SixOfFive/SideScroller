// Deterministic terrain heightmap shared by server and client. Terrain is
// STATIC (never re-randomized) so player bases stay valid; only resources and
// dinos re-roll at night. groundAt(x) returns the surface Y in world px
// (smaller Y = higher ground). Streams carve basins that hold water.

import { WORLD_W, REGIONS, REGION_W } from './regions.js';

const TERRAIN_SEED = 1337;
const SEG = 240;                 // px between terrain control points
const HILL_AMP = 210;            // max hill amplitude before roughness scaling
const MIN_Y = 434, MAX_Y = 662;  // clamp so terrain stays on screen / above dirt

// Keep the build hub gentle so the central base is easy to lay out.
const HUB_X0 = 300, HUB_X1 = 2450;

export const STREAM_HALF = 130;      // half-width of a stream basin
export const STREAM_DEPTH = 78;      // how far the basin dips below the banks
export const STREAM_SURFACE = 30;    // water surface sits this far below the banks

function h01(i) {
  let n = (i * 2654435761 + TERRAIN_SEED * 40503) >>> 0;
  n = (n ^ (n >>> 15)) * 2246822519 >>> 0;
  n = (n ^ (n >>> 13)) * 3266489917 >>> 0;
  return ((n ^ (n >>> 16)) >>> 0) / 4294967296;
}

// Smooth value noise from control points every SEG px.
function vnoise(x, salt) {
  const i = Math.floor(x / SEG);
  const f = x / SEG - i;
  const a = h01(i * 2 + salt * 9973);
  const b = h01((i + 1) * 2 + salt * 9973);
  const t = f * f * (3 - 2 * f);
  return a + (b - a) * t;
}

// Smoothly blend a region field between adjacent region centers (no hard steps).
function regionField(x, field) {
  const c = x / REGION_W - 0.5;
  const i = Math.max(0, Math.min(REGIONS.length - 1, Math.floor(c)));
  const j = Math.max(0, Math.min(REGIONS.length - 1, i + 1));
  const f = Math.max(0, Math.min(1, c - i));
  const t = f * f * (3 - 2 * f);
  return REGIONS[i][field] * (1 - t) + REGIONS[j][field] * t;
}

// 0 near the hub (flat), 1 away from it (full roughness).
function hubFlatten(x) {
  if (x <= HUB_X0 || x >= HUB_X1) return 1;
  const mid = (HUB_X0 + HUB_X1) / 2;
  const half = (HUB_X1 - HUB_X0) / 2;
  const d = Math.abs(x - mid) / half;      // 0 at center, 1 at edges
  return d * d;                            // flat core, easing out to hills
}

// Base terrain with no stream carving.
function groundBase(x) {
  const base = regionField(x, 'baseY');
  const rough = regionField(x, 'rough') * hubFlatten(x);
  const amp = HILL_AMP * rough;
  const y = base
    - (vnoise(x, 1) - 0.5) * amp
    - (vnoise(x * 0.41, 2) - 0.5) * amp * 0.45
    - (vnoise(x * 2.3, 3) - 0.5) * amp * 0.12;
  return y;
}

// One stream per region past the meadow, at a seeded offset.
function streamCenter(regionIdx) {
  return regionIdx * REGION_W + (0.32 + h01(regionIdx * 71 + 5) * 0.34) * REGION_W;
}

// Returns {c, d, carve} if x is inside a stream basin, else null.
export function streamAt(x) {
  const idx = Math.floor(x / REGION_W);
  for (const r of [idx - 1, idx, idx + 1]) {
    if (r < 1 || r >= REGIONS.length) continue;
    const c = streamCenter(r);
    const d = x - c;
    if (Math.abs(d) < STREAM_HALF) {
      const n = d / STREAM_HALF;
      return { c, d, carve: STREAM_DEPTH * (1 - n * n) };
    }
  }
  return null;
}

export function groundAt(x) {
  if (x < 0) x = 0; else if (x > WORLD_W) x = WORLD_W;
  let y = groundBase(x);
  const s = streamAt(x);
  if (s) y += s.carve;
  return y < MIN_Y ? MIN_Y : y > MAX_Y ? MAX_Y : y;
}

// Highest ground (smallest Y) beneath a footprint [x, x+w]; keeps a walker
// from sinking into an uphill slope.
export function groundTop(x, w) {
  return Math.min(groundAt(x + 3), groundAt(x + w / 2), groundAt(x + w - 3));
}

// Water surface Y at x, or null if no stream here. Flat across each basin.
export function waterSurfaceAt(x) {
  const s = streamAt(x);
  if (!s) return null;
  return groundBase(s.c) + STREAM_SURFACE;
}

// Is a point (foot) submerged in a stream?
export function inWater(x, footY) {
  const w = waterSurfaceAt(x);
  return w !== null && footY > w;
}

// Region grass color, smoothly blended between region centers.
export function grassAt(x) {
  const c = x / REGION_W - 0.5;
  const i = Math.max(0, Math.min(REGIONS.length - 1, Math.floor(c)));
  const j = Math.max(0, Math.min(REGIONS.length - 1, i + 1));
  const f = Math.max(0, Math.min(1, c - i));
  const t = f * f * (3 - 2 * f);
  const a = REGIONS[i].grass, b = REGIONS[j].grass;
  return [
    a[0] + (b[0] - a[0]) * t,
    a[1] + (b[1] - a[1]) * t,
    a[2] + (b[2] - a[2]) * t,
  ];
}

// Streams whose basins overlap [x0, x1]: [{c, surface}].
export function streamsIn(x0, x1) {
  const out = [];
  const i0 = Math.max(1, Math.floor((x0 - STREAM_HALF) / REGION_W));
  const i1 = Math.min(REGIONS.length - 1, Math.floor((x1 + STREAM_HALF) / REGION_W));
  for (let r = i0; r <= i1; r++) {
    const c = streamCenter(r);
    if (c + STREAM_HALF >= x0 && c - STREAM_HALF <= x1) {
      out.push({ c, surface: groundBase(c) + STREAM_SURFACE });
    }
  }
  return out;
}
