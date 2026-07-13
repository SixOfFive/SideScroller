// The 'use' message: campfire fueling/cooking and storage box transfers.

import { world } from './state.js';
import { isItem } from '../shared/items.js';
import { STRUCTURES } from '../shared/structures.js';
import { INTERACT_RANGE, PLAYER_W } from '../shared/const.js';
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
