// The expedition frontier: endless, progressively-deeper zones past the fixed
// world, reachable ONLY by portal. Each zone is generated on demand when a
// player warps in (depth-scaled nodes + dinos + a Descend/Warp-Home portal
// pair) and torn down once empty, so the world stays bounded while reading as
// "goes on forever." Nothing here is saved — a returning zone is a fresh roll.

import { world, newId } from './state.js';
import {
  EXP_W, MAX_DEPTH, expeditionZoneX0, expeditionEntranceX,
  expeditionDinoTable, expeditionNodeWeights,
} from '../shared/regions.js';
import { SPAWN_X } from '../shared/const.js';
import { groundAt } from '../shared/terrain.js';
import { DINODEFS } from '../shared/dinodefs.js';
import { STRUCTURES } from '../shared/structures.js';
import { makeNode } from './worldgen.js';
import { broadcast } from './net.js';

const NODE_KINDS = ['tree', 'rock', 'bush', 'metal', null];

function pickNode(weights) {
  let r = Math.random();
  for (let i = 0; i < weights.length; i++) { if (r < weights[i]) return NODE_KINDS[i]; r -= weights[i]; }
  return null;
}
function pickDino(table) {
  let total = 0; for (const e of table) total += e.w;
  let r = Math.random() * total;
  for (const e of table) { if ((r -= e.w) < 0) return e.sp; }
  return table[0].sp;
}
function expPortal(id, x, dest, label, hue) {
  const def = STRUCTURES.portal;
  return {
    id, kind: 'portal',
    x: Math.round(x - def.w / 2), y: Math.round(groundAt(x) - def.h),
    dest: Math.round(dest), label, hue, isle: false, owner: null,
  };
}

// Generate (or return) the expedition zone at `depth`.
export function ensureExpedition(depth) {
  if (!(depth >= 1) || depth > MAX_DEPTH) return null;
  const existing = world.expeditions.get(depth);
  if (existing) return existing;

  const x0 = expeditionZoneX0(depth), x1 = x0 + EXP_W;
  const nodeIds = [], dinoIds = [];

  // resource nodes (richer metal the deeper you push)
  const nw = expeditionNodeWeights(depth);
  let x = x0 + 220;
  while (x < x1 - 220) {
    const kind = pickNode(nw);
    if (kind) {
      const n = makeNode(kind, x);
      world.nodes.set(n.id, n); nodeIds.push(n.id);
      broadcast({ t: 'nadd', n });
    }
    x += 95 + Math.random() * 150;
  }

  // wild dinos from the depth-scaled table — more of them, nastier, deeper
  const table = expeditionDinoTable(depth);
  const count = 5 + Math.min(10, depth);
  for (let k = 0; k < count; k++) {
    const sp = pickDino(table);
    const def = DINODEFS[sp];
    const dx = x0 + 240 + Math.random() * (EXP_W - 480);
    const d = {
      id: newId('d'), sp, x: dx, y: groundAt(dx + def.w / 2) - def.h, vy: 0,
      face: Math.random() < 0.5 ? -1 : 1, state: 'idle', stateT: 1 + Math.random() * 3, targetX: dx,
      hp: def.hp, tame: 0, owner: null, name: def.name,
      lastFedAt: 0, fleeFrom: 0, eggAt: 0, lastBite: 0, rider: null,
    };
    world.dinos.set(d.id, d); dinoIds.push(d.id);
  }

  // a Warp-Home portal (back to the hub), and a Descend portal unless this is
  // the deepest zone (a Descend at MAX_DEPTH would teleport past EXP_END into
  // dead space with no zone to catch the player).
  const portalIds = [];
  const home = expPortal(`xp_h${depth}`, x0 + EXP_W * 0.26, SPAWN_X - 40, 'Warp Home ▲', 205);
  world.structures.set(home.id, home); broadcast({ t: 'sadd', s: home }); portalIds.push(home.id);
  if (depth < MAX_DEPTH) {
    const descend = expPortal(`xp_d${depth}`, x0 + EXP_W * 0.74, expeditionEntranceX(depth + 1), `Descend ▼ D${depth + 1}`, 315);
    world.structures.set(descend.id, descend); broadcast({ t: 'sadd', s: descend }); portalIds.push(descend.id);
  }

  const zone = { depth, x0, x1, nodes: nodeIds, dinos: dinoIds, portals: portalIds };
  world.expeditions.set(depth, zone);
  console.log(`expedition: generated depth ${depth} (${nodeIds.length} nodes, ${dinoIds.length} dinos)`);
  return zone;
}

// Tear down any expedition zone that has no players in it — frees memory and
// guarantees a fresh roll next visit. Wild dinos there simply stop being sent
// in the snapshot (the client prunes them); nodes/portals get explicit removes.
export function unloadEmptyExpeditions() {
  for (const [depth, zone] of world.expeditions) {
    let occupied = false;
    for (const p of world.players.values()) {
      if (p.x >= zone.x0 - 220 && p.x < zone.x1 + 220) { occupied = true; break; }
    }
    if (occupied) continue;
    for (const id of zone.nodes) if (world.nodes.delete(id)) broadcast({ t: 'nrem', id });
    // Sweep the WHOLE band, not just the ids we generated: a wild dino is
    // deleted, but an owned tame left behind (e.g. on 'stay') is sent home
    // rather than orphaned in a dead band or destroyed.
    for (const [id, d] of world.dinos) {
      const cx = d.x + DINODEFS[d.sp].w / 2;
      if (cx < zone.x0 || cx >= zone.x1) continue;
      if (d.owner) {
        d.x = SPAWN_X; d.y = groundAt(SPAWN_X + DINODEFS[d.sp].w / 2) - DINODEFS[d.sp].h;
        d.state = 'follow'; d.rider = null; d.guardId = null; d.dinoFoe = null;
      } else {
        world.dinos.delete(id);
      }
    }
    for (const id of zone.portals) if (world.structures.delete(id)) broadcast({ t: 'srem', id });
    world.expeditions.delete(depth);
    console.log(`expedition: unloaded empty depth ${depth}`);
  }
}
