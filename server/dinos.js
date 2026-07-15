// Dino systems: per-region spawning, wander/flee/chase/attack AI, two-way
// combat (players hit dinos, aggressive dinos hit players), passive taming,
// tamed follow/stay, rideable mounts, and egg laying.

import { world, newId } from './state.js';
import { DINODEFS, WEAPON_DMG } from '../shared/dinodefs.js';
import { ITEMS } from '../shared/items.js';
import { REGIONS, REGION_W } from '../shared/regions.js';
import { WORLD_W, HARVEST_RANGE, INTERACT_RANGE, PLAYER_W, PLAYER_H, GRAVITY } from '../shared/const.js';
import { groundAt } from '../shared/terrain.js';
import { send, toast, sendInv, sendStats, broadcast } from './net.js';
import { invAdd, invRemove } from './inventory.js';
import { swingReady, playerTool } from './harvest.js';
import { nearStructure } from './worldgen.js';

const SPAWN_CHECK_S = 8;
const REGION_TARGET = [4, 5, 6, 6, 6]; // wild dinos alive per region band
const PLAYER_CLEARANCE = 620;
const SAFE_X = REGION_W;                // aggressive dinos won't cross into the meadow

const randInt = (lo, hi) => lo + Math.floor(Math.random() * (hi - lo + 1));
const pickWeighted = (list) => {
  let total = 0;
  for (const e of list) total += e.w;
  let r = Math.random() * total;
  for (const e of list) { if ((r -= e.w) < 0) return e.sp; }
  return list[0].sp;
};

function dinoCenter(d) { return d.x + DINODEFS[d.sp].w / 2; }
function playerCenter(p) { return p.x + PLAYER_W / 2; }
function regionOf(x) { return Math.min(REGIONS.length - 1, Math.max(0, Math.floor(x / REGION_W))); }

// --- spawning ---------------------------------------------------------------

function spawnDinoInRegion(idx) {
  const region = REGIONS[idx];
  if (!region.dinos.length) return null;
  const sp = pickWeighted(region.dinos);
  const def = DINODEFS[sp];
  for (let tries = 0; tries < 10; tries++) {
    const x = idx * REGION_W + 120 + Math.random() * (REGION_W - 240);
    let clear = true;
    for (const p of world.players.values()) {
      if (Math.abs(p.x - x) < PLAYER_CLEARANCE) { clear = false; break; }
    }
    if (!clear) continue;
    const d = {
      id: newId('d'), sp,
      x, y: groundAt(x + def.w / 2) - def.h, vy: 0,
      face: Math.random() < 0.5 ? -1 : 1,
      state: 'idle', stateT: 1 + Math.random() * 3, targetX: x,
      hp: def.hp, tame: 0, owner: null, name: def.name,
      lastFedAt: 0, fleeFrom: 0, eggAt: 0, lastBite: 0, rider: null,
    };
    world.dinos.set(d.id, d);
    return d;
  }
  return null;
}

// Remove wild (untamed) dinos whose center falls in [x0, x1).
export function removeWildDinosIn(x0, x1) {
  for (const [id, d] of world.dinos) {
    if (d.owner || d.rider) continue;
    const c = dinoCenter(d);
    if (c >= x0 && c < x1) world.dinos.delete(id);
  }
}

// Spawn `count` wild dinos within [x0, x1) using the region-at-center table.
export function spawnDinosInSpan(x0, x1, count) {
  const region = REGIONS[regionOf((x0 + x1) / 2)];
  if (!region.dinos.length) return;
  for (let k = 0; k < count; k++) {
    const sp = pickWeighted(region.dinos);
    const def = DINODEFS[sp];
    let x = 0, ok = false;
    for (let tries = 0; tries < 8; tries++) {
      x = x0 + 80 + Math.random() * Math.max(1, x1 - x0 - 160);
      if (nearStructure(x, 150)) continue; // don't spawn onto a base
      let clear = true;
      // ...or onto anyone standing there (night re-rolls skip chunks near
      // humans, but AI survivors don't hold chunks — don't drop a raptor
      // on a sleeping bot's head).
      for (const p of world.players.values()) {
        if (Math.abs(p.x - x) < PLAYER_CLEARANCE) { clear = false; break; }
      }
      if (clear) { ok = true; break; }
    }
    if (!ok) continue;
    const id = newId('d');
    world.dinos.set(id, {
      id, sp,
      x, y: groundAt(x + def.w / 2) - def.h, vy: 0,
      face: Math.random() < 0.5 ? -1 : 1,
      state: 'idle', stateT: 1 + Math.random() * 3, targetX: x,
      hp: def.hp, tame: 0, owner: null, name: def.name,
      lastFedAt: 0, fleeFrom: 0, eggAt: 0, lastBite: 0, rider: null,
    });
  }
}

let spawnAcc = SPAWN_CHECK_S;

function maybeSpawn(dt) {
  spawnAcc += dt;
  if (spawnAcc < SPAWN_CHECK_S) return;
  spawnAcc = 0;
  const counts = new Array(REGIONS.length).fill(0);
  for (const d of world.dinos.values()) if (!d.owner) counts[regionOf(dinoCenter(d))]++;
  for (let i = 0; i < REGIONS.length; i++) {
    if (counts[i] < REGION_TARGET[i]) spawnDinoInRegion(i); // one per region per check
  }
}

// --- combat: dinos hurting players ------------------------------------------

function nearestPlayer(d, range) {
  let best = null, bd = range;
  const cx = dinoCenter(d);
  for (const p of world.players.values()) {
    if (playerCenter(p) < SAFE_X) continue;   // safe hub
    const dist = Math.abs(playerCenter(p) - cx);
    if (dist < bd) { bd = dist; best = p; }
  }
  return best;
}

// Total damage reduction from worn metal armor (0..0.78). A full set ~0.78,
// which turns a lethal raptor into something survivable.
function armorReduction(p) {
  let total = 0;
  const set = p.armorSet;
  if (set) {
    for (const slot of ['head', 'chest', 'legs', 'feet']) {
      const it = set[slot];
      if (it && ITEMS[it] && ITEMS[it].armor) total += ITEMS[it].armor.v;
    }
  }
  return Math.min(0.78, total / 90);
}

// Count living wild same-species dinos near d (including itself).
function packCount(d) {
  let n = 0;
  const cx = dinoCenter(d);
  for (const o of world.dinos.values()) {
    if (o.owner || o.sp !== d.sp) continue;
    if (Math.abs(dinoCenter(o) - cx) < 420) n++;
  }
  return n;
}

// How a hurt wild dino reacts: passives flee; timid packs flee when
// outnumbered; everything else turns and hunts the attacker.
function reactToAttack(d, def, p) {
  if (def.behavior === 'passive' || (def.timid && packCount(d) < (def.packMin || 2))) {
    d.state = 'flee'; d.fleeFrom = playerCenter(p); d.stateT = 4;
    return;
  }
  d.provokedT = 8;
  d.lastBite = Math.max(d.lastBite || 0, Date.now() - def.attackCd * 1000 + 250);
}

function bite(d, p, def, now) {
  d.lastBite = now;
  if (!world.settings.damage) return; // peaceful mode: no bite damage to rider or mount
  // A mounted rider is shielded — the mount soaks the hit instead.
  if (p.mount && world.dinos.has(p.mount)) {
    const mount = world.dinos.get(p.mount);
    mount.hp -= def.dmg;
    broadcast({ t: 'fx', kind: 'hit', x: dinoCenter(mount), y: mount.y + 20 });
    if (mount.hp <= 0) killDino(mount, null);
    return;
  }
  const dmg = def.dmg * (1 - armorReduction(p));
  p.hp = Math.max(0, p.hp - dmg);
  p.deathCause = def.name;
  const kx = Math.sign(playerCenter(p) - dinoCenter(d)) || 1;
  send(p, { t: 'hurt', dmg: Math.max(1, Math.round(dmg)), kx: kx * 260 });
  sendStats(p);
  broadcast({ t: 'fx', kind: 'hit', x: playerCenter(p), y: p.y + 20 });
}

// --- movement helpers -------------------------------------------------------

function walkOnGround(d, def) {
  d.x = Math.min(Math.max(d.x, 40), WORLD_W - 40 - def.w);
  d.y = groundAt(d.x + def.w / 2) - def.h;
  d.vy = 0;
}

function killDino(d, byPlayer) {
  const def = DINODEFS[d.sp];
  if (byPlayer) {
    for (const [item, [lo, hi]] of Object.entries(def.drops)) {
      const qty = randInt(lo, hi);
      if (qty > 0) { invAdd(byPlayer.inv, item, qty); send(byPlayer, { t: 'gain', item, qty }); }
    }
    sendInv(byPlayer);
  }
  // free any rider
  if (d.rider) {
    for (const p of world.players.values()) {
      if (p.name === d.rider) { p.mount = null; send(p, { t: 'dismount' }); }
    }
  }
  broadcast({ t: 'fx', kind: 'poof', x: dinoCenter(d), y: d.y + 15 });
  world.dinos.delete(d.id);
}

// --- per-dino step ----------------------------------------------------------

function stepTamed(d, def, dt, now) {
  if (d.rider) return; // ridden movement handled separately
  if (d.state !== 'stay') {
    d.state = 'follow';
    const o = ownerOf(d);
    if (o) {
      const dx = playerCenter(o) - dinoCenter(d);
      if (Math.abs(dx) > 1600) d.x = o.x - 80 * Math.sign(dx || 1);
      else if (Math.abs(dx) > 100) {
        d.face = Math.sign(dx);
        d.x += Math.sign(dx) * Math.max(def.speed * 1.7, 160) * dt;
      }
    }
  }
  if (d.eggAt && now >= d.eggAt) layEgg(d, def, now);
  walkOnGround(d, def);
}

function stepAggressive(d, def, dt, now) {
  // Being shot provokes a chase from beyond the normal aggro radius.
  d.provokedT = Math.max(0, (d.provokedT || 0) - dt);
  const range = d.provokedT > 0 ? Math.max(def.aggro, GUN_RANGE + 140) : def.aggro;
  const target = nearestPlayer(d, range);
  if (target) {
    const dx = playerCenter(target) - dinoCenter(d);
    // Vertical reach: only bite when the target's feet are near the dino's own
    // footing, so a ground-pinned dino can't chew a player up on a wall/roof.
    const dy = (target.y + PLAYER_H) - (d.y + def.h);
    const inReach = Math.abs(dx) <= def.attackRange && dy > -(def.h + 30) && dy < PLAYER_H;
    d.face = Math.sign(dx) || d.face;
    if (inReach) {
      d.state = 'attack';
      if (now - d.lastBite >= def.attackCd * 1000) bite(d, target, def, now);
    } else {
      d.state = 'chase';
      let nx = d.x + Math.sign(dx) * def.speed * dt;
      if (nx + def.w / 2 < SAFE_X) nx = SAFE_X - def.w / 2; // leash at the hub
      d.x = nx;
    }
  } else {
    wander(d, def, dt);
  }
  walkOnGround(d, def);
}

function wander(d, def, dt) {
  if (d.state === 'walk') {
    const dx = d.targetX - d.x;
    if (Math.abs(dx) < 8) { d.state = 'idle'; d.stateT = 2 + Math.random() * 4; }
    else { d.face = Math.sign(dx); d.x += d.face * def.speed * 0.6 * dt; }
  } else {
    d.stateT -= dt;
    if (d.stateT <= 0) { d.state = 'walk'; d.targetX = d.x + (Math.random() - 0.5) * 700; }
  }
}

function stepFlee(d, def, dt) {
  d.stateT -= dt;
  d.face = Math.sign(dinoCenter(d) - d.fleeFrom) || 1;
  d.x += d.face * def.fleeSpeed * dt;
  if (d.stateT <= 0) { d.state = 'idle'; d.stateT = 2 + Math.random() * 2; }
  walkOnGround(d, def);
}

function stepRidden(d, def, dt) {
  const rider = riderOf(d);
  if (!rider) { d.rider = null; d.state = 'idle'; return; }
  const dir = rider.rideDir || 0;
  if (dir) d.face = dir;
  d.x += dir * (def.rideSpeed || def.speed) * dt;
  d.x = Math.min(Math.max(d.x, 40), WORLD_W - 40 - def.w);

  const groundY = groundAt(d.x + def.w / 2) - def.h;
  // Snap-down so a mount stays grounded walking downhill and can still jump.
  const snap = Math.abs(dir) * (def.rideSpeed || def.speed) * dt * 2 + 4;
  const onGround = d.y >= groundY - snap && (d.vy || 0) >= 0;
  if (onGround) { d.y = groundY; d.vy = 0; }
  if (rider.rideJump && onGround) d.vy = -(def.rideJump || 700);
  d.vy = Math.min((d.vy || 0) + GRAVITY * dt, 1400);
  d.y += d.vy * dt;
  if (d.y >= groundY) { d.y = groundY; d.vy = 0; }

  // seat the rider on the dino's back (keep their broadcast pose still)
  rider.x = d.x + (def.w - PLAYER_W) / 2;
  rider.y = d.y - PLAYER_H + 18;
  rider.face = d.face;
  rider.vx = 0;
  rider.anim = 'idle';
}

function stepDino(d, dt, now) {
  const def = DINODEFS[d.sp];
  if (d.rider) { stepRidden(d, def, dt); return; }
  if (d.owner) { stepTamed(d, def, dt, now); return; }
  if (d.state === 'flee') { stepFlee(d, def, dt); return; }
  if (def.behavior === 'aggressive') { stepAggressive(d, def, dt, now); return; }
  wander(d, def, dt);
  walkOnGround(d, def);
}

export function updateDinos(dt, now) {
  maybeSpawn(dt);
  for (const d of world.dinos.values()) stepDino(d, dt, now);
}

// --- helpers over players ---------------------------------------------------

function ownerOf(d) {
  for (const p of world.players.values()) if (p.name === d.owner) return p;
  return null;
}
function riderOf(d) {
  // Match on the live mount binding, not the stored name, so a reconnected
  // same-name session (whose p.mount is null) can never be captured by a
  // stale d.rider — the stepRidden self-heal then clears d.rider next tick.
  for (const p of world.players.values()) if (p.mount === d.id) return p;
  return null;
}
function layEgg(d, def, now) {
  const o = ownerOf(d);
  if (o) {
    invAdd(o.inv, 'egg', 1);
    send(o, { t: 'gain', item: 'egg', qty: 1 });
    sendInv(o);
    toast(o, `${d.name} laid an egg!`);
    broadcast({ t: 'fx', kind: 'heart', x: dinoCenter(d), y: d.y - 6 });
    d.eggAt = now + randInt(def.egg[0], def.egg[1]) * 1000;
  } else {
    d.eggAt = now + 60000;
  }
}

// --- network wire -----------------------------------------------------------

export function wireDinos() {
  return [...world.dinos.values()].map((d) => ({
    i: d.id, sp: d.sp,
    x: Math.round(d.x), y: Math.round(d.y), f: d.face, s: d.state,
    tm: Math.round(d.tame * 100) / 100, o: d.owner, h: Math.round(d.hp),
    nm: d.name, r: d.rider ? 1 : 0,
  }));
}

// --- message handlers -------------------------------------------------------

export function attack(p, m) {
  const d = world.dinos.get(m.dino);
  if (!d) return;
  if (d.owner) { toast(p, `${d.name} is tamed — leave it be`); return; }
  if (!swingReady(p)) return;
  if (Math.abs(dinoCenter(d) - playerCenter(p)) > HARVEST_RANGE + DINODEFS[d.sp].w / 2) return;

  // A gun is not a melee weapon — pistol-whipping does bare-hand damage, no ammo.
  const tool = playerTool(p);
  d.hp -= (tool === 'gun' ? WEAPON_DMG.hand : WEAPON_DMG[tool]) || WEAPON_DMG.hand;
  if (d.tame > 0) d.tame = 0;
  const def = DINODEFS[d.sp];
  reactToAttack(d, def, p);
  broadcast({ t: 'fx', kind: 'hit', x: dinoCenter(d), y: d.y + 10 });
  if (d.hp <= 0) killDino(d, p);
}

const GUN_RANGE = 780;
const GUN_COOLDOWN_MS = 520;

export function shoot(p, m) {
  if (playerTool(p) !== 'gun') return;
  const now = Date.now();
  if (now - (p.lastShot || 0) < GUN_COOLDOWN_MS) return;

  // Validate target + range BEFORE spending the bullet (no wasted ammo on a
  // shot the server rejects for range).
  const d = world.dinos.get(m.dino);
  if (!d || d.owner) return;
  if (Math.abs(dinoCenter(d) - playerCenter(p)) > GUN_RANGE) { toast(p, 'Out of range'); return; }
  if ((p.inv.bullet || 0) < 1) { toast(p, 'Out of bullets'); return; }
  p.lastShot = now;
  invRemove(p.inv, 'bullet', 1);
  sendInv(p);

  const muzzleX = playerCenter(p) + p.face * 22, muzzleY = p.y + 22;
  const def = DINODEFS[d.sp];
  broadcast({ t: 'fx', kind: 'muzzle', x: muzzleX, y: muzzleY });
  broadcast({ t: 'fx', kind: 'tracer', x: muzzleX, y: muzzleY, x2: dinoCenter(d), y2: d.y + def.h / 2 });
  d.hp -= WEAPON_DMG.gun;
  if (d.tame > 0) d.tame = 0;
  reactToAttack(d, def, p); // aggressive dinos hunt the shooter; timid packs may flee
  broadcast({ t: 'fx', kind: 'hit', x: dinoCenter(d), y: d.y + def.h / 2 });
  if (d.hp <= 0) killDino(d, p);
}

export function feed(p, m) {
  const d = world.dinos.get(m.dino);
  if (!d || d.owner) return;
  const def = DINODEFS[d.sp];
  if (!def.tame) { toast(p, `${def.name}s can't be tamed that way`); return; }
  if (Math.abs(dinoCenter(d) - playerCenter(p)) > INTERACT_RANGE + def.w / 2) return;

  const now = Date.now();
  if (now - d.lastFedAt < def.tame.cooldownS * 1000) {
    toast(p, `The ${def.name.toLowerCase()} is still munching…`);
    return;
  }
  if (!invRemove(p.inv, def.tame.food, 1)) {
    toast(p, `You need ${def.tame.food === 'berry' ? 'berries' : def.tame.food} to tame it`);
    return;
  }
  d.lastFedAt = now;
  d.tame += 1 / def.tame.feeds;
  d.state = 'idle';
  d.stateT = def.tame.cooldownS;
  broadcast({ t: 'fx', kind: 'heart', x: dinoCenter(d), y: d.y - 6 });
  sendInv(p);

  if (d.tame >= 1) {
    d.tame = 1;
    d.owner = p.name;
    d.state = 'follow';
    if (def.egg) d.eggAt = now + randInt(def.egg[0], def.egg[1]) * 1000;
    broadcast({ t: 'chat', from: '', text: `${p.name} tamed a ${def.name}!` });
    toast(p, def.rideable
      ? `${def.name} tamed! T follow/stay · R to ride.`
      : `${def.name} tamed! It follows you — T to make it stay.`);
  }
}

export function dinoCmd(p, m) {
  const d = world.dinos.get(m.dino);
  if (!d || d.owner !== p.name) return;
  const def = DINODEFS[d.sp];
  if (m.cmd === 'stay') {
    d.state = 'stay'; d.rider = null;
    if (p.mount === d.id) { p.mount = null; send(p, { t: 'dismount' }); } // don't strand the rider
    toast(p, `${d.name} will wait here`);
  }
  else if (m.cmd === 'follow') { d.state = 'follow'; toast(p, `${d.name} is following you`); }
  else if (m.cmd === 'mount') {
    if (!def.rideable) { toast(p, `You can't ride a ${def.name}`); return; }
    if (Math.abs(dinoCenter(d) - playerCenter(p)) > INTERACT_RANGE + def.w / 2) return;
    if (p.mount) { const old = world.dinos.get(p.mount); if (old) old.rider = null; }
    d.rider = p.name; d.state = 'ridden'; p.mount = d.id;
    send(p, { t: 'mount', dino: d.id });
    toast(p, `Riding ${d.name} — A/D move, Space jump, R dismount.`);
  } else if (m.cmd === 'dismount') {
    if (p.mount === d.id) { d.rider = null; d.state = 'follow'; p.mount = null; send(p, { t: 'dismount' }); }
  }
}

// Rider control values arrive on the player's input message (handlers.js).
export function setRideInput(p, dir, jump) {
  p.rideDir = dir;
  p.rideJump = jump;
}
