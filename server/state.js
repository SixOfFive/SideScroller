// The authoritative world state, plus save/load.

import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'node:fs';
import { DATA_DIR, SAVE_PATH } from './config.js';

export const world = {
  nodes: new Map(),      // id -> {id, kind, x, hp, max, dep, depAt}
  structures: new Map(), // id -> {id, kind, x, y, owner, lit?, fuelS?, inv?}
  dinos: new Map(),      // id -> dino (stage 2)
  players: new Map(),    // id -> live connected player (not saved directly)
  profiles: {},          // lower-case name -> {name, x, y, inv, stats, equip}
  time: 60,              // world clock in seconds (day cycle uses modulo)
  nextId: 1,
};

export function newId(prefix) {
  return prefix + world.nextId++;
}

// Copy a live player's persistent fields back into their profile.
export function syncProfile(p) {
  world.profiles[p.key] = {
    name: p.name,
    x: Math.round(p.x),
    y: Math.round(p.y),
    inv: p.inv,
    stats: { hp: p.hp, hunger: p.hunger },
    equip: p.equip,
  };
}

export function saveWorld() {
  for (const p of world.players.values()) syncProfile(p);
  const data = {
    time: world.time,
    nextId: world.nextId,
    nodes: [...world.nodes.values()],
    structures: [...world.structures.values()],
    dinos: [...world.dinos.values()],
    profiles: world.profiles,
  };
  try {
    if (!existsSync(DATA_DIR)) mkdirSync(DATA_DIR, { recursive: true });
    writeFileSync(SAVE_PATH, JSON.stringify(data));
  } catch (e) {
    console.error('save failed:', e.message);
  }
}

// Returns true if a save was loaded, false if the world needs generating.
export function loadWorld() {
  if (!existsSync(SAVE_PATH)) return false;
  try {
    const data = JSON.parse(readFileSync(SAVE_PATH, 'utf8'));
    world.time = data.time || 60;
    world.nextId = data.nextId || 1;
    world.profiles = data.profiles || {};
    for (const n of data.nodes || []) world.nodes.set(n.id, n);
    for (const s of data.structures || []) world.structures.set(s.id, s);
    for (const d of data.dinos || []) world.dinos.set(d.id, d);
    return world.nodes.size > 0;
  } catch (e) {
    console.error('load failed, regenerating world:', e.message);
    return false;
  }
}
