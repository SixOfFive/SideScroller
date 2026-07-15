// The authoritative world state, plus save/load.

import { readFileSync, writeFileSync, renameSync, mkdirSync, existsSync } from 'node:fs';
import { DATA_DIR, SAVE_PATH, SAVE_TMP_PATH, MAX_PROFILES } from './config.js';
import { EXP_BASE } from '../shared/regions.js';
import { SPAWN_X } from '../shared/const.js';
import { groundAt } from '../shared/terrain.js';
import { DINODEFS } from '../shared/dinodefs.js';

export const world = {
  nodes: new Map(),      // id -> {id, kind, x, hp, max, dep, depAt}
  structures: new Map(), // id -> {id, kind, x, y, owner, lit?, fuelS?, inv?}
  dinos: new Map(),      // id -> dino (stage 2)
  players: new Map(),    // id -> live connected player (not saved directly)
  // lower-case name -> {name, x, y, inv, stats, equip, tokenHash, lastSeen}.
  // Null prototype: names like '__proto__' or 'constructor' must be plain keys,
  // never prototype accessors.
  profiles: Object.create(null),
  time: 60,              // world clock in seconds (day cycle uses modulo)
  nextId: 1,
  // Active expedition zones: depth -> {depth, x0, x1, nodes:[ids], dinos:[ids],
  // portals:[ids]}. Transient — generated on warp, unloaded when empty, never saved.
  expeditions: new Map(),
  rolledNight: false,    // transient: has this night's chunk re-roll fired yet
  // World-wide rules, adjustable from the ESC options menu.
  settings: { hunger: true, thirst: true, damage: true, instantTame: false, dayLen: 480, bots: 3 },
};

export const DEFAULT_SETTINGS = { hunger: true, thirst: true, damage: true, instantTame: false, dayLen: 480, bots: 3 };

export function newId(prefix) {
  return prefix + world.nextId++;
}

// Sentinel tokenHash marking AI-survivor profiles (a real client token hashes
// to 64 hex chars, so this can never collide with one).
export const BOT_TOKEN = 'bot';

// Is this survivor name an AI survivor (live or remembered)? Used to let
// players raid bot camps while other players' bases stay protected.
export function isBotName(name) {
  const key = String(name).toLowerCase();
  for (const p of world.players.values()) if (p.key === key) return !!p.bot;
  const prof = world.profiles[key];
  return !!prof && prof.tokenHash === BOT_TOKEN;
}

// Copy a live player's persistent fields back into their profile.
export function syncProfile(p) {
  world.profiles[p.key] = {
    name: p.name,
    x: Math.round(p.x),
    y: Math.round(p.y),
    inv: p.inv,
    stats: { hp: p.hp, hunger: p.hunger, thirst: p.thirst },
    equip: p.equip,
    armorSet: p.armorSet,
    tokenHash: p.tokenHash,
    lastSeen: Date.now(),
  };
}

// Keep the profile map bounded: evict the longest-offline profiles. Bot
// profiles are exempt (bounded at 6 names) — evicting one would let a human
// claim the bot's name, camp, and tames, and lock that bot out forever.
function evictStaleProfiles() {
  const keys = Object.keys(world.profiles);
  if (keys.length <= MAX_PROFILES) return;
  const online = new Set([...world.players.values()].map((p) => p.key));
  keys
    .filter((k) => !online.has(k) && world.profiles[k].tokenHash !== BOT_TOKEN)
    .sort((a, b) => (world.profiles[a].lastSeen || 0) - (world.profiles[b].lastSeen || 0))
    .slice(0, keys.length - MAX_PROFILES)
    .forEach((k) => delete world.profiles[k]);
}

// Bump when world geometry changes shape (e.g. the terrain overhaul):
// old saves are discarded and the world regenerates.
// v3: world widened to 10 bands (mainland + strait + outer isles).
export const SAVE_VERSION = 3;

export function saveWorld() {
  for (const p of world.players.values()) syncProfile(p);
  evictStaleProfiles();
  const data = {
    v: SAVE_VERSION,
    time: world.time,
    nextId: world.nextId,
    // Expedition entities (x >= EXP_BASE) are transient — never persist them.
    nodes: [...world.nodes.values()].filter((n) => n.x < EXP_BASE),
    // portals are world fixtures rebuilt at boot; don't persist them
    structures: [...world.structures.values()].filter((s) => s.kind !== 'portal' && s.x < EXP_BASE),
    // Wild expedition dinos are dropped, but an OWNED tame carried into the
    // frontier is saved and snapped back to the hub (its zone won't exist on
    // load), so a player never loses a bronto to a restart.
    dinos: [...world.dinos.values()]
      .filter((d) => d.x < EXP_BASE || d.owner)
      .map((d) => (d.x < EXP_BASE ? d : {
        ...d, x: SPAWN_X, y: groundAt(SPAWN_X + DINODEFS[d.sp].w / 2) - DINODEFS[d.sp].h,
        state: 'follow', rider: null,
      })),
    profiles: world.profiles,
    settings: world.settings,
  };
  try {
    if (!existsSync(DATA_DIR)) mkdirSync(DATA_DIR, { recursive: true });
    // Write-then-rename so a crash mid-write can't corrupt the only save.
    writeFileSync(SAVE_TMP_PATH, JSON.stringify(data));
    renameSync(SAVE_TMP_PATH, SAVE_PATH);
  } catch (e) {
    console.error('save failed:', e.message);
  }
}

// Returns true if a save was loaded, false if the world needs generating.
export function loadWorld() {
  if (!existsSync(SAVE_PATH)) return false;
  try {
    const data = JSON.parse(readFileSync(SAVE_PATH, 'utf8'));
    if (data.v !== SAVE_VERSION) {
      console.log(`save version ${data.v ?? 1} != ${SAVE_VERSION}; regenerating world`);
      return false;
    }
    world.time = data.time || 60;
    world.nextId = data.nextId || 1;
    world.settings = Object.assign({ ...DEFAULT_SETTINGS }, data.settings || {});
    world.profiles = Object.assign(Object.create(null), data.profiles || {});
    for (const n of data.nodes || []) world.nodes.set(n.id, n);
    for (const s of data.structures || []) world.structures.set(s.id, s);
    for (const d of data.dinos || []) world.dinos.set(d.id, d);
    return world.nodes.size > 0;
  } catch (e) {
    console.error('load failed, regenerating world:', e.message);
    return false;
  }
}
