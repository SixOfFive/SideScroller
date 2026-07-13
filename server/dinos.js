// Dino systems: spawning, wander/flee AI, hunting, passive taming with food,
// tamed follow/stay, and egg laying. Dodo first; new species are DINODEFS
// entries plus a client sprite.

import { world, newId } from './state.js';
import { DINODEFS } from '../shared/dinodefs.js';
import {
  WORLD_W, GROUND_Y, HARVEST_RANGE, INTERACT_RANGE, PLAYER_W,
} from '../shared/const.js';
import { groundAt } from '../shared/terrain.js';
import { send, toast, sendInv, broadcast } from './net.js';
import { invAdd, invRemove } from './inventory.js';
import { swingReady, playerTool } from './harvest.js';

const DODO_CAP = 14;
const SPAWN_CHECK_S = 20;
const SPAWN_MIN_X = 1200;
const PLAYER_CLEARANCE = 500;
const WEAPON_DMG = { spear: 15, axe: 8, pick: 8, hand: 4 };

const randInt = (lo, hi) => lo + Math.floor(Math.random() * (hi - lo + 1));

function dinoCenter(d) { return d.x + DINODEFS[d.sp].w / 2; }
function playerCenter(p) { return p.x + PLAYER_W / 2; }

function spawnDino(sp) {
  const def = DINODEFS[sp];
  for (let tries = 0; tries < 12; tries++) {
    const x = SPAWN_MIN_X + Math.random() * (WORLD_W - SPAWN_MIN_X - 400);
    let clear = true;
    for (const p of world.players.values()) {
      if (Math.abs(p.x - x) < PLAYER_CLEARANCE) { clear = false; break; }
    }
    if (!clear) continue;
    const d = {
      id: newId('d'), sp,
      x, y: groundAt(x + def.w / 2) - def.h, face: Math.random() < 0.5 ? -1 : 1,
      state: 'idle', stateT: 1 + Math.random() * 3, targetX: x,
      hp: def.hp, tame: 0, owner: null, name: def.name,
      lastFedAt: 0, fleeFrom: 0, eggAt: 0,
    };
    world.dinos.set(d.id, d);
    return d;
  }
  return null;
}

let spawnAcc = SPAWN_CHECK_S; // first check fires immediately after boot

function maybeSpawn(dt) {
  spawnAcc += dt;
  if (spawnAcc < SPAWN_CHECK_S) return;
  spawnAcc = 0;
  let wild = 0;
  for (const d of world.dinos.values()) if (!d.owner) wild++;
  const deficit = DODO_CAP - wild;
  if (deficit <= 0) return;
  const batch = wild === 0 ? Math.min(8, deficit) : 1;
  for (let i = 0; i < batch; i++) spawnDino('dodo');
}

function ownerOf(d) {
  for (const p of world.players.values()) if (p.name === d.owner) return p;
  return null;
}

function stepDino(d, dt, now) {
  const def = DINODEFS[d.sp];

  if (d.owner) {
    if (d.state !== 'stay') {
      d.state = 'follow';
      const o = ownerOf(d);
      if (o) {
        const dx = playerCenter(o) - dinoCenter(d);
        if (Math.abs(dx) > 1400) {
          d.x = o.x - 70 * Math.sign(dx || 1); // waddled too far behind: catch up
        } else if (Math.abs(dx) > 90) {
          d.face = Math.sign(dx);
          d.x += Math.sign(dx) * Math.max(def.speed * 1.7, 150) * dt;
        }
      }
    }
    // egg timer
    if (d.eggAt && now >= d.eggAt) {
      const o = ownerOf(d);
      if (o) {
        invAdd(o.inv, 'egg', 1);
        send(o, { t: 'gain', item: 'egg', qty: 1 });
        sendInv(o);
        toast(o, `${d.name} laid an egg!`);
        broadcast({ t: 'fx', kind: 'heart', x: dinoCenter(d), y: d.y - 6 });
        d.eggAt = now + randInt(def.eggIntervalS[0], def.eggIntervalS[1]) * 1000;
      } else {
        d.eggAt = now + 60000; // owner offline; retry later
      }
    }
  } else if (d.state === 'flee') {
    d.stateT -= dt;
    d.face = Math.sign(dinoCenter(d) - d.fleeFrom) || 1;
    d.x += d.face * def.fleeSpeed * dt;
    if (d.stateT <= 0) { d.state = 'idle'; d.stateT = 2 + Math.random() * 2; }
  } else if (d.state === 'walk') {
    const dx = d.targetX - d.x;
    if (Math.abs(dx) < 8) {
      d.state = 'idle';
      d.stateT = 2 + Math.random() * 4;
    } else {
      d.face = Math.sign(dx);
      d.x += d.face * def.speed * dt;
    }
  } else { // idle
    d.stateT -= dt;
    if (d.stateT <= 0) {
      d.state = 'walk';
      d.targetX = d.x + (Math.random() - 0.5) * 700;
    }
  }

  d.x = Math.min(Math.max(d.x, 60), WORLD_W - 60 - def.w);
  d.y = groundAt(d.x + def.w / 2) - def.h;
}

export function updateDinos(dt, now) {
  maybeSpawn(dt);
  for (const d of world.dinos.values()) stepDino(d, dt, now);
}

export function wireDinos() {
  return [...world.dinos.values()].map((d) => ({
    i: d.id, sp: d.sp,
    x: Math.round(d.x), y: Math.round(d.y), f: d.face, s: d.state,
    tm: Math.round(d.tame * 100) / 100, o: d.owner, h: Math.round(d.hp),
    nm: d.name,
  }));
}

export function attack(p, m) {
  const d = world.dinos.get(m.dino);
  if (!d) return;
  if (d.owner) { toast(p, `${d.name} is tamed — leave it be`); return; }
  if (!swingReady(p)) return;
  if (Math.abs(dinoCenter(d) - playerCenter(p)) > HARVEST_RANGE + 60) return;

  d.hp -= WEAPON_DMG[playerTool(p)] || 4;
  if (d.tame > 0) d.tame = 0; // violence ruins trust
  d.state = 'flee';
  d.fleeFrom = playerCenter(p);
  d.stateT = 4;
  broadcast({ t: 'fx', kind: 'hit', x: dinoCenter(d), y: d.y + 10 });

  if (d.hp <= 0) {
    const def = DINODEFS[d.sp];
    for (const [item, [lo, hi]] of Object.entries(def.drops)) {
      const qty = randInt(lo, hi);
      invAdd(p.inv, item, qty);
      send(p, { t: 'gain', item, qty });
    }
    sendInv(p);
    broadcast({ t: 'fx', kind: 'poof', x: dinoCenter(d), y: d.y + 15 });
    world.dinos.delete(d.id);
  }
}

export function feed(p, m) {
  const d = world.dinos.get(m.dino);
  if (!d || d.owner) return;
  const def = DINODEFS[d.sp];
  if (Math.abs(dinoCenter(d) - playerCenter(p)) > INTERACT_RANGE + 60) return;

  const now = Date.now();
  if (now - d.lastFedAt < def.feedCooldownS * 1000) {
    toast(p, `The ${def.name.toLowerCase()} is still munching…`);
    return;
  }
  if (!invRemove(p.inv, def.tameFood, 1)) {
    toast(p, `You need ${def.tameFood === 'berry' ? 'berries' : def.tameFood} to tame it`);
    return;
  }
  d.lastFedAt = now;
  d.tame += 1 / def.tameFeeds;
  d.state = 'idle';
  d.stateT = def.feedCooldownS; // it stays put while digesting
  broadcast({ t: 'fx', kind: 'heart', x: dinoCenter(d), y: d.y - 6 });
  sendInv(p);

  if (d.tame >= 1) {
    d.tame = 1;
    d.owner = p.name;
    d.state = 'follow';
    d.eggAt = now + randInt(def.eggIntervalS[0], def.eggIntervalS[1]) * 1000;
    broadcast({ t: 'chat', from: '', text: `${p.name} tamed a ${def.name}!` });
    toast(p, `${def.name} tamed! It follows you now — T to make it stay.`);
  }
}

export function dinoCmd(p, m) {
  const d = world.dinos.get(m.dino);
  if (!d || d.owner !== p.name) return;
  if (m.cmd === 'stay') {
    d.state = 'stay';
    toast(p, `${d.name} will wait here`);
  } else if (m.cmd === 'follow') {
    d.state = 'follow';
    toast(p, `${d.name} is following you`);
  }
}
