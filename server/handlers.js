// Message routing plus the small handlers (movement, equip, eat, chat, craft).
// Bigger systems live in their own modules.

import { ITEMS, isItem, isArmor } from '../shared/items.js';
import { RECIPES } from '../shared/recipes.js';
import {
  WORLD_W, PLAYER_W, PLAYER_H, CHAT_MAX, STATS_MAX, DRINK_AMOUNT,
} from '../shared/const.js';
import { clampStrait } from '../shared/regions.js';
import { inWater } from '../shared/terrain.js';
import { world } from './state.js';
import { send, toast, sendInv, sendStats, broadcast } from './net.js';
import { invAdd, invRemove, invCount, invPayCost } from './inventory.js';
import { harvest } from './harvest.js';
import { build, demolish } from './building.js';
import { use } from './interact.js';
import { attack, feed, dinoCmd, setRideInput, shoot } from './dinos.js';

const ARMOR_SLOTS = ['head', 'chest', 'legs', 'feet'];

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
    // Clamp to the world, then out of the impassable strait (backstop for the
    // client's own barrier — movement is client-authoritative).
    if (Number.isFinite(x)) p.x = clampStrait(clamp(x, 0, WORLD_W - PLAYER_W), PLAYER_W);
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
    if (def.food.thirst) p.thirst = clamp((p.thirst ?? STATS_MAX) + def.food.thirst, 0, STATS_MAX);
    // Food never kills outright, but the floor must not heal a dying player.
    p.hp = clamp(p.hp + def.food.hp, Math.min(p.hp, 1), STATS_MAX);
    sendInv(p);
    sendStats(p);
  },

  drink(p) {
    if (!inWater(p.x + PLAYER_W / 2, p.y + PLAYER_H)) {
      toast(p, 'You need to stand in a stream to drink');
      return;
    }
    p.thirst = clamp((p.thirst ?? STATS_MAX) + DRINK_AMOUNT, 0, STATS_MAX);
    sendStats(p);
    send(p, { t: 'drank' });
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

  wear(p, m) {
    if (!isArmor(m.item) || invCount(p.inv, m.item) < 1) return;
    const slot = ITEMS[m.item].armor.slot;
    if (p.armorSet[slot]) invAdd(p.inv, p.armorSet[slot], 1); // swap out the old piece
    invRemove(p.inv, m.item, 1);
    p.armorSet[slot] = m.item;
    toast(p, `Equipped ${ITEMS[m.item].name}`);
    sendInv(p);
  },

  takeoff(p, m) {
    const slot = typeof m.slot === 'string' ? m.slot : '';
    if (!ARMOR_SLOTS.includes(slot) || !p.armorSet[slot]) return;
    invAdd(p.inv, p.armorSet[slot], 1);
    p.armorSet[slot] = '';
    sendInv(p);
  },

  // World settings from the ESC menu — co-op style, any survivor may adjust.
  setSettings(p, m) {
    const s = world.settings;
    let changed = false;
    for (const k of ['hunger', 'thirst', 'damage']) {
      if (typeof m[k] === 'boolean' && s[k] !== m[k]) { s[k] = m[k]; changed = true; }
    }
    // AI survivor count (0..4 — matches MAX_BOTS; bots.js applies the change).
    if (Number.isInteger(m.bots) && m.bots >= 0 && m.bots <= 4 && s.bots !== m.bots) {
      s.bots = m.bots;
      changed = true;
    }
    if ([240, 480, 960].includes(m.dayLen) && m.dayLen !== s.dayLen) {
      // Preserve the current day phase so the nightfall gate can't jump and
      // fire the chunk re-roll many times (or skip it) when day length changes.
      const phase = (world.time % s.dayLen) / s.dayLen;
      world.time = Math.floor(world.time / s.dayLen) * m.dayLen + phase * m.dayLen;
      s.dayLen = m.dayLen;
      changed = true;
    }
    if (!changed) return; // ignore no-op spam (chat-flood guard)
    broadcast({ t: 'settings', settings: s });
    const now = Date.now();
    if (now - (p.lastSettingsMsg || 0) >= 800) {
      p.lastSettingsMsg = now;
      broadcast({ t: 'chat', from: '', text: `${p.name} changed the world settings.` });
    }
  },

  harvest, build, demolish, use, attack, feed, dinoCmd, shoot,
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
