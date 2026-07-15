// Night re-randomization. The world is divided into chunks; at nightfall any
// chunk with no players nearby has its wild resources and dinos wiped and
// re-rolled — so the wilds feel restless and metal/dino luck changes when you
// aren't looking. Player structures, portals, and tamed dinos are preserved.

import { world } from './state.js';
import { WORLD_W, regionAt } from '../shared/regions.js';
import { generateSpan } from './worldgen.js';
import { removeWildDinosIn, spawnDinosInSpan } from './dinos.js';
import { broadcast } from './net.js';

export const CHUNK_W = 1600;              // 10 chunks across the 16000px world
const OCCUPY_MARGIN = 900;                // ~a screen; don't re-roll near players

function occupied(x0, x1) {
  for (const p of world.players.values()) {
    if (p.bot) continue; // AI survivors don't hold chunks fresh
    if (p.x >= x0 - OCCUPY_MARGIN && p.x <= x1 + OCCUPY_MARGIN) return true;
  }
  return false;
}

export function rollUnoccupiedChunks() {
  let rolled = 0;
  for (let x0 = 0; x0 < WORLD_W; x0 += CHUNK_W) {
    const x1 = Math.min(x0 + CHUNK_W, WORLD_W);
    if (occupied(x0, x1)) continue;

    for (const [id, n] of world.nodes) {
      if (n.x >= x0 && n.x < x1) { world.nodes.delete(id); broadcast({ t: 'nrem', id }); }
    }
    removeWildDinosIn(x0, x1);

    const made = generateSpan(x0, x1);        // fresh nodes from the region mix
    for (const n of made) broadcast({ t: 'nadd', n });
    const region = regionAt((x0 + x1) / 2);
    spawnDinosInSpan(x0, x1, 1 + (region.danger || 0)); // dino snapshots sync to clients
    rolled++;
  }
  if (rolled) {
    console.log(`night re-roll: ${rolled} chunk(s) refreshed`);
    broadcast({ t: 'chat', from: '', text: 'The night stirs — distant lands have changed.' });
  }
}
