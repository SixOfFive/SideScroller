// Message routing plus the small handlers (movement, equip, eat, chat, craft).
// Bigger systems live in their own modules.

import { ITEMS, isItem } from '../shared/items.js';
import { RECIPES } from '../shared/recipes.js';
import {
  WORLD_W, PLAYER_W, CHAT_MAX, STATS_MAX,
} from '../shared/const.js';
import { toast, sendInv, sendStats, broadcast } from './net.js';
import { invAdd, invRemove, invCount, invPayCost } from './inventory.js';
import { harvest } from './harvest.js';
import { build, demolish } from './building.js';
import { use } from './interact.js';
import { attack, feed, dinoCmd, setRideInput } from './dinos.js';

const ANIMS = new Set(['idle', 'walk', 'jump', 'swing']);
const clamp = (v, lo, hi) => Math.min(Math.max(v, lo), hi);

const HANDLERS = {
  input(p, m) {
    if (p.mount) {
      // Mounted: the server drives the rider's position; only steer the mount.
      setRideInput(p, m.ride === -1 ? -1 : m.ride === 1 ? 1 : 0, !!m.rj);
      return;
    }
    const x = Number(m.x), y = Number(m.y);
    if (Number.isFinite(x)) p.x = clamp(x, 0, WORLD_W - PLAYER_W);
    if (Number.isFinite(y)) p.y = clamp(y, -1200, 720); // terrain valleys reach ~606
    p.vx = clamp(Number(m.vx) || 0, -520, 520);
    p.face = m.f === -1 ? -1 : 1;
    p.anim = ANIMS.has(m.a) ? m.a : 'idle';
  },

  equip(p, m) {
    const item = typeof m.item === 'string' ? m.item : '';
    if (item === '') { p.equip = ''; sendInv(p); return; }
    if (isItem(item) && ITEMS[item].tool && invCount(p.inv, item) > 0) {
      p.equip = item;
      sendInv(p);
    }
  },

  eat(p, m) {
    const def = isItem(m.item) ? ITEMS[m.item] : null;
    if (!def || !def.food) return;
    if (!invRemove(p.inv, m.item, 1)) { toast(p, 'None left'); return; }
    p.hunger = clamp(p.hunger + def.food.hunger, 0, STATS_MAX);
    // Food never kills outright, but the floor must not heal a dying player.
    p.hp = clamp(p.hp + def.food.hp, Math.min(p.hp, 1), STATS_MAX);
    sendInv(p);
    sendStats(p);
  },

  craft(p, m) {
    if (typeof m.id !== 'string' || !Object.prototype.hasOwnProperty.call(RECIPES, m.id)) return;
    const r = RECIPES[m.id];
    if (r.structure) return;
    if (!invPayCost(p.inv, r.cost)) { toast(p, 'Not enough resources'); return; }
    for (const [item, qty] of Object.entries(r.gives)) invAdd(p.inv, item, qty);
    toast(p, `Crafted ${r.name}`);
    sendInv(p);
  },

  chat(p, m) {
    const now = Date.now();
    if (now - p.lastChat < 600) return; // chat is the loudest broadcast path
    const text = String(m.text ?? '').slice(0, CHAT_MAX).trim();
    if (!text) return;
    p.lastChat = now;
    broadcast({ t: 'chat', from: p.name, text });
  },

  harvest, build, demolish, use, attack, feed, dinoCmd,
};

export function route(p, msg) {
  if (!Object.prototype.hasOwnProperty.call(HANDLERS, msg.t)) return;
  const h = HANDLERS[msg.t];
  try {
    h(p, msg);
  } catch (e) {
    console.error(`handler '${msg.t}' failed:`, e);
  }
}
