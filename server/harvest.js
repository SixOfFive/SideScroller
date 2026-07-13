// Harvesting resource nodes. ARK-style tool affinity: hands pull thatch off
// trees, an axe chops wood; a pick pulls stone and flint out of rocks.

import { world } from './state.js';
import { ITEMS } from '../shared/items.js';
import { HARVEST_RANGE, SWING_COOLDOWN_MS, PLAYER_W } from '../shared/const.js';
import { send, sendInv, broadcast } from './net.js';
import { invAdd } from './inventory.js';

// rolls: [item, min, max, chance]
const YIELDS = {
  tree: {
    hand:  { dmg: 5,  rolls: [['thatch', 1, 2, 1], ['wood', 1, 1, 0.3]] },
    axe:   { dmg: 20, rolls: [['wood', 2, 3, 1], ['thatch', 1, 1, 0.5]] },
    pick:  { dmg: 10, rolls: [['wood', 1, 1, 1], ['thatch', 1, 1, 1]] },
    spear: { dmg: 5,  rolls: [['thatch', 1, 1, 1]] },
  },
  rock: {
    hand:  { dmg: 5,  rolls: [['stone', 1, 1, 1]] },
    pick:  { dmg: 20, rolls: [['stone', 2, 3, 1], ['flint', 1, 1, 0.4]] },
    axe:   { dmg: 10, rolls: [['stone', 1, 2, 1], ['flint', 1, 1, 0.2]] },
    spear: { dmg: 5,  rolls: [['stone', 1, 1, 1]] },
  },
  bush: {
    hand:  { dmg: 10, rolls: [['berry', 3, 5, 1], ['fiber', 1, 2, 1]] },
    axe:   { dmg: 10, rolls: [['berry', 1, 2, 1], ['fiber', 1, 2, 1]] },
    pick:  { dmg: 10, rolls: [['berry', 1, 2, 1], ['fiber', 1, 1, 1]] },
    spear: { dmg: 10, rolls: [['berry', 1, 2, 1], ['fiber', 1, 1, 1]] },
  },
};

const randInt = (lo, hi) => lo + Math.floor(Math.random() * (hi - lo + 1));

// Shared swing gate for harvest and (stage 2) attacks.
export function swingReady(p) {
  const now = Date.now();
  if (now - p.lastSwing < SWING_COOLDOWN_MS - 60) return false;
  p.lastSwing = now;
  return true;
}

export function playerTool(p) {
  const def = ITEMS[p.equip];
  return def && def.tool ? def.tool : 'hand';
}

export function harvest(p, m) {
  const node = world.nodes.get(m.node);
  if (!node || node.dep) return;
  if (!swingReady(p)) return;

  const dx = node.x - (p.x + PLAYER_W / 2);
  if (Math.abs(dx) > HARVEST_RANGE + 50) return;

  const table = YIELDS[node.kind][playerTool(p)] || YIELDS[node.kind].hand;
  node.hp -= table.dmg;

  let gained = false;
  for (const [item, lo, hi, chance] of table.rolls) {
    if (Math.random() >= chance) continue;
    const qty = randInt(lo, hi);
    if (qty <= 0) continue;
    invAdd(p.inv, item, qty);
    send(p, { t: 'gain', item, qty });
    gained = true;
  }
  if (gained) sendInv(p);

  if (node.hp <= 0) {
    node.hp = 0;
    node.dep = true;
    node.depAt = Date.now();
  }
  broadcast({ t: 'node', id: node.id, hp: node.hp, dep: node.dep ? 1 : 0 });
}
