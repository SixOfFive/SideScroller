// AI survivors: server-driven players that live in world.players, look like
// regular players on the wire (snapshots, name tags, chat), and climb the same
// tech ladder — gather, craft, build a camp, hunt, tame, reach metal. Their
// progress persists through profiles just like a real survivor's.
//
// The count comes from world.settings.bots (ESC options). Bots never hold a
// human player slot, never block night chunk re-rolls, and their profile is
// stamped with a sentinel tokenHash so a player can't hijack (or lose a
// survivor name to) a bot, and vice versa.

import { world, newId, syncProfile, BOT_TOKEN } from './state.js';
import { broadcast, wirePlayer } from './net.js';
import { think, THINK_S } from './botbrain.js';
import { WORLD_W, PLAYER_W, PLAYER_H, STATS_MAX, MOVE_SPEED } from '../shared/const.js';
import { groundTop, streamsIn, STREAM_HALF } from '../shared/terrain.js';

export const MAX_BOTS = 4;

// ARK Explorer-Notes survivors. Homes stay in survivable country (meadow edge
// and forest) — deep-region camps just got the early bots killed on repeat.
// The 4th dares the highlands edge.
const BOT_NAMES = ['Helena', 'Rockwell', 'Mei Yin', 'Santiago', 'Raia', 'Dahkeya'];
const HOME_SPOTS = [2620, 4180, 5860, 6760, 9740, 12160];

const BOT_SPEED = MOVE_SPEED * 0.85; // a touch slower than players, still outruns raptors

// A ws stub that every send helper safely ignores (readyState !== 1).
const STUB_WS = { readyState: 3, send() {}, close() {}, terminate() {} };

// Keep a camp anchor out of stream basins so huts don't sit in the water.
function dryHome(x) {
  for (const s of streamsIn(x - 420, x + 420)) {
    if (Math.abs(s.c - x) < 420) x = s.c + STREAM_HALF + 340;
  }
  return x;
}

function spawnBot(idx) {
  const name = BOT_NAMES[idx];
  const key = name.toLowerCase();
  const prof = world.profiles[key];
  // Never take over a real player's survivor (or an in-use name).
  if (prof && prof.tokenHash && prof.tokenHash !== BOT_TOKEN) return null;
  for (const o of world.players.values()) if (o.key === key) return null;

  const home = dryHome(HOME_SPOTS[idx]);
  const p = {
    id: newId('p'), key, ws: STUB_WS, tokenHash: BOT_TOKEN, bot: true,
    name,
    x: Number.isFinite(prof?.x) ? prof.x : home,
    y: 0,
    vx: 0, face: 1, anim: 'idle',
    hp: Number.isFinite(prof?.stats?.hp) ? prof.stats.hp : STATS_MAX,
    hunger: Number.isFinite(prof?.stats?.hunger) ? prof.stats.hunger : STATS_MAX,
    thirst: Number.isFinite(prof?.stats?.thirst) ? prof.stats.thirst : STATS_MAX,
    inv: prof && prof.inv && typeof prof.inv === 'object' ? prof.inv : {},
    equip: typeof prof?.equip === 'string' ? prof.equip : '',
    armorSet: prof && prof.armorSet && typeof prof.armorSet === 'object'
      ? prof.armorSet : { head: '', chest: '', legs: '', feet: '' },
    mount: null, rideDir: 0, rideJump: false, deathCause: null,
    lastSwing: 0, lastChat: 0, lastShot: 0, lastStatSig: '',
    ai: {
      home, moveTarget: null, goalId: '', goalCost: null, swingT: 0,
      fleeT: 0, fleeDir: -1, fails: {}, stash: false, dashT: 0, campWait: 0,
      thinkT: Math.random() * THINK_S,
      chatT: 90 + Math.random() * 150, greetT: 45,
    },
  };
  p.y = groundTop(p.x, PLAYER_W) - PLAYER_H;
  // A returning bot resumes at the camp it already built.
  const owned = [...world.structures.values()]
    .filter((s) => s.owner === name && s.kind !== 'portal');
  if (owned.length) {
    p.ai.home = dryHome(Math.round(owned.reduce((a, s) => a + s.x, 0) / owned.length));
  }
  world.players.set(p.id, p);
  broadcast({ t: 'pjoin', p: wirePlayer(p) });
  broadcast({ t: 'chat', from: '', text: `${name} wandered in from the wilds.` });
  console.log(`bot up: ${name} (home ~${Math.round(p.ai.home)})`);
  return p;
}

function despawnBot(p) {
  syncProfile(p); // progress survives the despawn
  world.players.delete(p.id);
  broadcast({ t: 'pleave', id: p.id });
  broadcast({ t: 'chat', from: '', text: `${p.name} wandered off into the wilds.` });
  console.log(`bot down: ${p.name}`);
}

// Match the live bot population to the settings dial.
function syncBotCount() {
  const want = Math.max(0, Math.min(MAX_BOTS, Math.trunc(world.settings.bots ?? 0) || 0));
  const live = [...world.players.values()].filter((p) => p.bot)
    .sort((a, b) => BOT_NAMES.indexOf(a.name) - BOT_NAMES.indexOf(b.name));
  while (live.length > want) despawnBot(live.pop());
  if (live.length < want) {
    const used = new Set(live.map((p) => p.key));
    for (let i = 0; i < BOT_NAMES.length && live.length < want; i++) {
      if (used.has(BOT_NAMES[i].toLowerCase())) continue;
      const p = spawnBot(i); // may refuse (player-owned name) — try the next
      if (p) live.push(p);
    }
  }
}

function stepBot(p, dt) {
  const ai = p.ai;
  ai.thinkT -= dt;
  if (ai.thinkT <= 0) {
    ai.thinkT = THINK_S;
    try { think(p); } catch (e) { console.error(`bot ${p.name} think failed:`, e); }
  }

  ai.swingT = Math.max(0, ai.swingT - dt);
  const t = ai.moveTarget;
  if (t != null) {
    const cx = p.x + PLAYER_W / 2;
    const dir = t > cx ? 1 : -1;
    p.x += dir * Math.min(Math.abs(t - cx), BOT_SPEED * dt);
    p.face = dir;
    p.vx = dir * BOT_SPEED;
    p.anim = 'walk';
    if (Math.abs(t - (p.x + PLAYER_W / 2)) < 2) { ai.moveTarget = null; p.vx = 0; p.anim = 'idle'; }
  } else {
    p.vx = 0;
    p.anim = 'idle';
  }
  if (ai.swingT > 0) p.anim = 'swing';
  p.x = Math.min(Math.max(p.x, 20), WORLD_W - PLAYER_W - 20);
  p.y = groundTop(p.x, PLAYER_W) - PLAYER_H;
}

let syncT = 0;

export function updateBots(dt) {
  syncT -= dt;
  if (syncT <= 0) { syncT = 2; syncBotCount(); }
  for (const p of world.players.values()) {
    if (p.bot) stepBot(p, dt);
  }
}

export function initBots() {
  syncBotCount();
}
