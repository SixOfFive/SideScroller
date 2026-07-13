// Generates resource nodes along the strip using each region's node mix.
// Nodes carry their terrain y so clients never re-derive placement. Streams
// stay clear of nodes. Also reusable per-chunk for night re-randomization.

import { world, newId } from './state.js';
import { REGIONS, REGION_W, WORLD_W } from '../shared/regions.js';
import { groundAt, streamAt } from '../shared/terrain.js';

export const NODE_HP = { tree: 60, rock: 80, bush: 30, metal: 120 };
const NODE_KINDS = ['tree', 'rock', 'bush', 'metal', null];
const EDGE = 320;

function mulberry32(seed) {
  let a = seed >>> 0;
  return function () {
    a |= 0; a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function pick(rand, weights) {
  let r = rand();
  for (let i = 0; i < weights.length; i++) {
    if (r < weights[i]) return NODE_KINDS[i];
    r -= weights[i];
  }
  return null;
}

export function makeNode(kind, x) {
  const hp = NODE_HP[kind];
  const id = newId('n');
  return {
    id, kind, x: Math.round(x), y: Math.round(groundAt(x)),
    hp, max: hp, dep: false, depAt: 0,
  };
}

// Fill [x0, x1) with nodes according to the local region mix. Returns them
// (already inserted into world.nodes).
export function generateSpan(x0, x1, rand = Math.random) {
  const rng = typeof rand === 'function' ? rand : Math.random;
  const made = [];
  let x = Math.max(x0, EDGE);
  const end = Math.min(x1, WORLD_W - EDGE);
  while (x < end) {
    const region = REGIONS[Math.min(REGIONS.length - 1, Math.floor(x / REGION_W))];
    const kind = pick(rng, region.nodes);
    if (kind && !streamAt(x)) {
      const n = makeNode(kind, x);
      world.nodes.set(n.id, n);
      made.push(n);
    }
    x += 85 + rng() * 150;
  }
  return made;
}

export function generateWorld(seed) {
  generateSpan(0, WORLD_W, mulberry32(seed));
  console.log(`worldgen: ${world.nodes.size} resource nodes across ${REGIONS.length} regions`);
}
