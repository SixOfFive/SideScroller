// Building placement and demolition. Placement geometry/support rules live in
// shared/place.js so the client ghost and the server agree.

import { world, newId, isBotName } from './state.js';
import { RECIPES } from '../shared/recipes.js';
import { STRUCTURES } from '../shared/structures.js';
import { computePlacement } from '../shared/place.js';
import { GRID, PLAYER_W, INTERACT_RANGE, BUILD_REACH } from '../shared/const.js';
import { toast, sendInv, broadcast } from './net.js';
import { invAdd, invHas, invPayCost } from './inventory.js';

const colOf = (x) => Math.round(x / GRID);

export function build(p, m) {
  const r = RECIPES[m.kind];
  if (!r || !r.structure) return;
  if (!invHas(p.inv, r.cost)) { toast(p, 'Not enough resources'); return; }

  const place = computePlacement(m.kind, Number(m.x) || 0, world.structures.values());
  if (!place.ok) { toast(p, place.reason); return; }

  const def = STRUCTURES[m.kind];
  if (Math.abs(place.x + def.w / 2 - (p.x + PLAYER_W / 2)) > BUILD_REACH) {
    toast(p, 'Too far away');
    return;
  }

  invPayCost(p.inv, r.cost);
  const s = { id: newId('s'), kind: m.kind, x: place.x, y: place.y, owner: p.name };
  if (m.kind === 'campfire') { s.lit = false; s.fuelS = 0; }
  if (m.kind === 'storage_box') { s.inv = {}; }
  world.structures.set(s.id, s);
  broadcast({ t: 'sadd', s });
  sendInv(p);
}

function supportsSomething(s) {
  const col = colOf(s.x);
  if (s.kind === 'foundation') {
    for (const o of world.structures.values()) {
      if (o !== s && colOf(o.x) === col &&
          (o.kind === 'wall' || o.kind === 'doorframe' || o.kind === 'roof')) return true;
    }
  }
  if (s.kind === 'wall' || s.kind === 'doorframe') {
    for (const o of world.structures.values()) {
      if (o === s || colOf(o.x) !== col) continue;
      if (o.kind === 'roof') return true;
      if ((o.kind === 'wall' || o.kind === 'doorframe') && o.y < s.y) return true;
    }
  }
  return false;
}

export function demolish(p, m) {
  const s = world.structures.get(m.id);
  if (!s) return;
  // AI survivor camps are fair game — raid away, they'll rebuild. Other
  // players' bases stay protected.
  if (s.owner !== p.name && !isBotName(s.owner)) { toast(p, 'Not your structure'); return; }
  const def = STRUCTURES[s.kind];
  if (Math.abs(s.x + def.w / 2 - (p.x + PLAYER_W / 2)) > INTERACT_RANGE + 80) return;
  if (supportsSomething(s)) { toast(p, 'Something is built on top of it'); return; }

  // Refund half the cost; dump any storage contents on the demolisher.
  const cost = RECIPES[s.kind] ? RECIPES[s.kind].cost : {};
  for (const [item, qty] of Object.entries(cost)) invAdd(p.inv, item, Math.floor(qty / 2));
  if (s.inv) for (const [item, qty] of Object.entries(s.inv)) invAdd(p.inv, item, qty);

  world.structures.delete(s.id);
  broadcast({ t: 'srem', id: s.id });
  toast(p, `${STRUCTURES[s.kind].name} demolished (half refunded)`);
  sendInv(p);

  // A raided AI survivor takes it personally (and then just rebuilds).
  if (s.owner !== p.name) {
    const bot = [...world.players.values()].find((o) => o.name === s.owner && o.bot);
    if (bot) {
      const lines = ['Hey — my camp!', `I saw that, ${p.name}.`, 'Fine. I\'ll build it again.'];
      broadcast({ t: 'chat', from: bot.name, text: lines[Math.floor(Math.random() * lines.length)] });
    }
  }
}
