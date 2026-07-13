// Generates resource nodes along the strip. Biomes get richer further out:
// spawn meadow (berries) -> forest (trees) -> rocky hills (stone) -> deep mix.

import { world, newId } from './state.js';
import { WORLD_W } from '../shared/const.js';

const NODE_HP = { tree: 60, rock: 80, bush: 30 };

function mulberry32(seed) {
  let a = seed >>> 0;
  return function () {
    a |= 0; a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// [tree, rock, bush, nothing] weights by world progress 0..1
function biomeWeights(t) {
  if (t < 0.12) return [0.20, 0.10, 0.50, 0.20]; // meadow
  if (t < 0.45) return [0.60, 0.10, 0.20, 0.10]; // forest
  if (t < 0.75) return [0.15, 0.55, 0.10, 0.20]; // rocky hills
  return [0.35, 0.35, 0.20, 0.10];               // deep wilds
}

function pick(rand, weights) {
  const kinds = ['tree', 'rock', 'bush', null];
  let r = rand();
  for (let i = 0; i < weights.length; i++) {
    if (r < weights[i]) return kinds[i];
    r -= weights[i];
  }
  return null;
}

export function generateWorld(seed) {
  const rand = mulberry32(seed);
  let x = 320;
  while (x < WORLD_W - 320) {
    const kind = pick(rand, biomeWeights(x / WORLD_W));
    if (kind) {
      const hp = NODE_HP[kind];
      const id = newId('n');
      world.nodes.set(id, {
        id, kind, x: Math.round(x), hp, max: hp, dep: false, depAt: 0,
      });
    }
    x += 95 + rand() * 170;
  }
  console.log(`worldgen: ${world.nodes.size} resource nodes`);
}
