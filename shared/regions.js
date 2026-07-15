// The world is a strip of contiguous bands. The MAINLAND (meadow hub ->
// badlands) is one walkable danger gradient. Past it lies the Sunder Strait —
// an impassable channel you can only cross by portal — and beyond that the
// OUTER ISLES: four distinct biomes reached from the hub's portals, not by
// walking further along the scroll. Terrain params, resource mix, and dino
// tables all key off these entries. REGION_W * REGIONS.length == WORLD_W.

export const REGION_W = 3200;

// nodes: weights for [tree, rock, bush, metal, nothing]
// dinos: spawn weights; species keys resolve in shared/dinodefs.js
// barrier: true marks an impassable band (the strait) — no nodes, no dinos.
// isle: true marks a portal-only outer biome (past the strait).
export const REGIONS = [
  {
    key: 'meadow', name: 'Spawn Meadow', danger: 0,
    baseY: 602, rough: 0.22, grass: [96, 165, 74],
    nodes: [0.22, 0.08, 0.48, 0.0, 0.22],
    dinos: [{ sp: 'dodo', w: 1 }],
  },
  {
    key: 'forest', name: 'Whispering Forest', danger: 1,
    baseY: 590, rough: 0.55, grass: [74, 143, 58],
    nodes: [0.55, 0.08, 0.18, 0.02, 0.17],
    dinos: [{ sp: 'dodo', w: 3 }, { sp: 'compy', w: 3 }, { sp: 'parasaur', w: 2 }, { sp: 'trike', w: 1 }],
  },
  {
    key: 'hills', name: 'Rocky Highlands', danger: 2,
    baseY: 560, rough: 0.95, grass: [96, 132, 74],
    nodes: [0.15, 0.44, 0.08, 0.13, 0.20],
    dinos: [{ sp: 'compy', w: 3 }, { sp: 'dilo', w: 3 }, { sp: 'parasaur', w: 2 }, { sp: 'raptor', w: 1 }, { sp: 'trike', w: 1 }],
  },
  {
    key: 'wilds', name: 'Deep Wilds', danger: 3,
    baseY: 582, rough: 0.75, grass: [64, 116, 62],
    nodes: [0.30, 0.24, 0.12, 0.12, 0.22],
    dinos: [{ sp: 'dilo', w: 3 }, { sp: 'raptor', w: 3 }, { sp: 'parasaur', w: 2 }, { sp: 'carno', w: 2 }, { sp: 'rex', w: 1 }],
  },
  {
    key: 'badlands', name: 'Scorched Badlands', danger: 4,
    baseY: 600, rough: 1.0, grass: [128, 104, 66],
    nodes: [0.10, 0.40, 0.04, 0.26, 0.20],
    dinos: [{ sp: 'raptor', w: 3 }, { sp: 'rex', w: 2 }, { sp: 'dilo', w: 2 }, { sp: 'carno', w: 2 }],
  },
  {
    // The barrier. Rendered as open sea; walking into it is clamped at the shore.
    key: 'strait', name: 'Sunder Strait', danger: 0, barrier: true,
    baseY: 604, rough: 0.12, grass: [58, 92, 120],
    nodes: [0.0, 0.0, 0.0, 0.0, 1.0],
    dinos: [],
  },
  {
    key: 'jungle', name: 'Verdant Canopy', danger: 2, isle: true,
    baseY: 596, rough: 0.7, grass: [52, 150, 66],
    nodes: [0.60, 0.06, 0.20, 0.04, 0.10],
    dinos: [{ sp: 'troodon', w: 3 }, { sp: 'compy', w: 2 }, { sp: 'raptor', w: 2 }, { sp: 'parasaur', w: 2 }, { sp: 'trike', w: 1 }],
  },
  {
    key: 'glacier', name: 'Frozen Reach', danger: 3, isle: true,
    baseY: 566, rough: 0.85, grass: [196, 206, 224],
    nodes: [0.22, 0.34, 0.03, 0.16, 0.25],
    dinos: [{ sp: 'sabertooth', w: 3 }, { sp: 'raptor', w: 2 }, { sp: 'trike', w: 2 }, { sp: 'rex', w: 1 }],
  },
  {
    key: 'swamp', name: 'Fetid Mire', danger: 3, isle: true,
    baseY: 606, rough: 0.5, grass: [74, 104, 72],
    nodes: [0.44, 0.10, 0.16, 0.10, 0.20],
    dinos: [{ sp: 'sarco', w: 3 }, { sp: 'dilo', w: 3 }, { sp: 'troodon', w: 2 }, { sp: 'parasaur', w: 2 }],
  },
  {
    key: 'volcano', name: 'Emberpeak', danger: 5, isle: true,
    baseY: 598, rough: 1.0, grass: [96, 68, 60],
    nodes: [0.06, 0.42, 0.02, 0.34, 0.16],
    dinos: [{ sp: 'rex', w: 3 }, { sp: 'carno', w: 3 }, { sp: 'raptor', w: 2 }],
  },
];

export const WORLD_W = REGION_W * REGIONS.length; // 32000

// --- the impassable strait -------------------------------------------------
// The one barrier band separates the mainland from the outer isles. Foot and
// mount travel is clamped to whichever shore you're on; portals set position
// directly on the far side, so they cross freely.
export const STRAIT_IDX = REGIONS.findIndex((r) => r.barrier);
export const STRAIT_X0 = STRAIT_IDX * REGION_W;
export const STRAIT_X1 = (STRAIT_IDX + 1) * REGION_W;

// Nearest-shore clamp for an incremental mover (top-left x, width w). Anything
// whose center lands inside the strait is pushed back out to the closer shore.
// Safe for step-by-step movement (nobody teleports into the middle); portals
// bypass this by writing x directly.
export function clampStrait(x, w) {
  const half = w / 2;
  const c = x + half;
  if (c <= STRAIT_X0 || c >= STRAIT_X1) return x;
  return (c - STRAIT_X0 < STRAIT_X1 - c ? STRAIT_X0 - 6 : STRAIT_X1 + 6) - half;
}

export function regionIndexAt(x) {
  const i = Math.floor(x / REGION_W);
  return i < 0 ? 0 : i >= REGIONS.length ? REGIONS.length - 1 : i;
}

export function regionAt(x) {
  return REGIONS[regionIndexAt(x)];
}

// Center x of a region's playable band (used for portal destinations).
export function regionEntranceX(idx) {
  return idx * REGION_W + REGION_W * 0.5;
}
