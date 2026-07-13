// The island is a strip of contiguous regions, spawn hub first, getting more
// dangerous outward. Terrain params, resource mix, and dino tables all key off
// these. REGION_W * REGIONS.length must equal WORLD_W (16000).

export const REGION_W = 3200;

// nodes: weights for [tree, rock, bush, metal, nothing]
// dinos: spawn weights; species keys resolve in shared/dinodefs.js
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
    nodes: [0.58, 0.08, 0.17, 0.0, 0.17],
    dinos: [{ sp: 'dodo', w: 3 }, { sp: 'compy', w: 3 }, { sp: 'parasaur', w: 2 }],
  },
  {
    key: 'hills', name: 'Rocky Highlands', danger: 2,
    baseY: 560, rough: 0.95, grass: [96, 132, 74],
    nodes: [0.15, 0.44, 0.09, 0.12, 0.20],
    dinos: [{ sp: 'compy', w: 3 }, { sp: 'dilo', w: 3 }, { sp: 'parasaur', w: 2 }, { sp: 'raptor', w: 1 }],
  },
  {
    key: 'wilds', name: 'Deep Wilds', danger: 3,
    baseY: 582, rough: 0.75, grass: [64, 116, 62],
    nodes: [0.30, 0.26, 0.14, 0.10, 0.20],
    dinos: [{ sp: 'dilo', w: 3 }, { sp: 'raptor', w: 3 }, { sp: 'parasaur', w: 2 }, { sp: 'rex', w: 1 }],
  },
  {
    key: 'badlands', name: 'Scorched Badlands', danger: 4,
    baseY: 600, rough: 1.0, grass: [128, 104, 66],
    nodes: [0.12, 0.40, 0.05, 0.23, 0.20],
    dinos: [{ sp: 'raptor', w: 3 }, { sp: 'rex', w: 2 }, { sp: 'dilo', w: 2 }],
  },
];

export const WORLD_W = REGION_W * REGIONS.length; // 16000

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
