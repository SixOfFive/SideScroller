// The 'use' message: campfire fueling/cooking and storage box transfers.

import { world } from './state.js';
import { isItem } from '../shared/items.js';
import { STRUCTURES } from '../shared/structures.js';
import { INTERACT_RANGE, PLAYER_W, PLAYER_H, WORLD_W } from '../shared/const.js';
import { EXP_BASE, expeditionDepthAt, clampMove } from '../shared/regions.js';
import { DINODEFS } from '../shared/dinodefs.js';
import { groundAt } from '../shared/terrain.js';
import { ensureExpedition } from './expeditions.js';
import { send, toast, sendInv, broadcast } from './net.js';
import { invAdd, invRemove, invCount } from './inventory.js';

const FUEL_PER_WOOD_S = 90;
const FUEL_CAP_S = 900;
const COOK_BATCH = 10;

function inRange(p, s) {
  const def = STRUCTURES[s.kind];
  return Math.abs(s.x + def.w / 2 - (p.x + PLAYER_W / 2)) <= INTERACT_RANGE + 80;
}

export function use(p, m) {
  const s = world.structures.get(m.id);
  if (!s || !inRange(p, s)) return;

  if (s.kind === 'portal') {
    const now = Date.now();
    if (now - (p.lastTp || 0) < 1200) return; // no instant round-trips
    p.lastTp = now;
    const dx = Number(s.dest) || 0;

    // Warping into expedition space? Generate that zone before we land so its
    // nodes, dinos, and Descend/Home portals exist on arrival.
    if (dx >= EXP_BASE) ensureExpedition(expeditionDepthAt(dx));

    // Bring the player's FOLLOWING tames through the portal, fanned out beside
    // the landing so they don't stack into one blob. Stay-mode pets hold their
    // post and are left behind. A portal is the only legit way a pet crosses
    // the strait (the follow-code's catch-up snap is blocked from crossing).
    let k = 0;
    for (const d of world.dinos.values()) {
      if (d.owner !== p.name || d.state === 'stay') continue;
      if (d.rider && d.rider !== p.name) continue; // someone else's ride — leave it
      const def = DINODEFS[d.sp];
      const off = (70 + (k % 6) * 52) * (k % 2 ? 1 : -1); // alternate sides, widen
      const nx = clampMove(dx + off, def.w, dx); // land inside the destination band
      d.x = nx;
      d.y = groundAt(nx + def.w / 2) - def.h;
      d.vy = 0; d.guardId = null; d.dinoFoe = null;
      if (d.rider === p.name) { d.rider = null; d.state = 'follow'; } // dismount the ride
      k++;
    }

    p.x = dx;
    p.y = groundAt(dx + PLAYER_W / 2) - PLAYER_H;
    p.vx = 0;
    if (p.mount) { p.mount = null; send(p, { t: 'dismount' }); }
    send(p, { t: 'tp', x: p.x, y: p.y, label: s.label });
    broadcast({ t: 'fx', kind: 'poof', x: p.x + PLAYER_W / 2, y: p.y + PLAYER_H / 2 });
    return;
  }

  if (s.kind === 'forge') {
    if (m.action !== 'smelt') return;
    const ore = invCount(p.inv, 'metal_ore');
    if (!ore) { toast(p, 'No metal ore to smelt'); return; }
    const wood = invCount(p.inv, 'wood');
    if (!wood) { toast(p, 'Need wood to fire the forge'); return; }
    const n = Math.min(ore, wood, 10);
    invRemove(p.inv, 'metal_ore', n);
    invRemove(p.inv, 'wood', n);
    invAdd(p.inv, 'metal_ingot', n);
    let char = 0;
    for (let i = 0; i < n; i++) if (Math.random() < 0.34) char++;
    if (char) invAdd(p.inv, 'charcoal', char);
    s.lit = true;
    s.fuelS = 8; // glow briefly after a smelt
    send(p, { t: 'gain', item: 'metal_ingot', qty: n });
    if (char) send(p, { t: 'gain', item: 'charcoal', qty: char });
    broadcast({ t: 'supd', s });
    sendInv(p);
    toast(p, `Smelted ${n} ingot${n > 1 ? 's' : ''}${char ? ` (+${char} charcoal)` : ''}`);
    return;
  }

  if (s.kind === 'campfire') {
    if (m.action === 'fuel') {
      if (!invRemove(p.inv, 'wood', 1)) { toast(p, 'Need wood for fuel'); return; }
      s.fuelS = Math.min(FUEL_CAP_S, (s.fuelS || 0) + FUEL_PER_WOOD_S);
      s.lit = true;
      broadcast({ t: 'supd', s });
      sendInv(p);
    } else if (m.action === 'cook') {
      if (!s.lit) { toast(p, 'The fire is out — add wood'); return; }
      const n = Math.min(invCount(p.inv, 'raw_meat'), COOK_BATCH);
      if (!n) { toast(p, 'No raw meat to cook'); return; }
      invRemove(p.inv, 'raw_meat', n);
      invAdd(p.inv, 'cooked_meat', n);
      send(p, { t: 'gain', item: 'cooked_meat', qty: n });
      sendInv(p);
    }
    return;
  }

  if (s.kind === 'storage_box') {
    const item = isItem(m.item) ? m.item : null;
    if (!item) return;
    let qty = Math.floor(Number(m.qty));
    if (!Number.isFinite(qty) || qty < 1) qty = 1;
    qty = Math.min(qty, 999);

    if (m.action === 'deposit') {
      // Can't stash your equipped tool's last copy while it's in hand — unequip it.
      const moved = invRemove(p.inv, item, qty);
      if (!moved) return;
      if (p.equip === item && invCount(p.inv, item) === 0) p.equip = '';
      invAdd(s.inv, item, moved);
    } else if (m.action === 'withdraw') {
      const moved = invRemove(s.inv, item, qty);
      if (!moved) return;
      invAdd(p.inv, item, moved);
    } else {
      return;
    }
    broadcast({ t: 'supd', s });
    sendInv(p);
  }
}
