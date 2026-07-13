// The fixed-rate game loop: hunger/starvation/regen, campfire fuel, resource
// respawns, dino AI, and state snapshots.

import { world } from './state.js';
import {
  TICK_HZ, SNAP_HZ, NODE_RESPAWN_MS, STATS_MAX, SPAWN_X, GROUND_Y, PLAYER_H,
  HUNGER_DRAIN_PS, STARVE_HP_PS, REGEN_HP_PS, REGEN_HUNGER_MIN,
} from '../shared/const.js';
import { groundAt } from '../shared/terrain.js';
import { send, sendStats, broadcast, wirePlayer } from './net.js';
import { updateDinos, wireDinos } from './dinos.js';

let tickCount = 0;

function respawn(p) {
  if (p.mount) { // drop the rider off their mount on death
    const mount = world.dinos.get(p.mount);
    if (mount) mount.rider = null;
    p.mount = null;
    send(p, { t: 'dismount' });
  }
  const cause = p.deathCause || 'the wilds';
  p.deathCause = null;
  p.hp = STATS_MAX;
  p.hunger = Math.max(p.hunger, 55);
  p.x = SPAWN_X + Math.random() * 100;
  p.y = groundAt(p.x + 14) - PLAYER_H;
  send(p, { t: 'dead', x: p.x, y: p.y });
  sendStats(p);
  const msg = cause === 'starved'
    ? `${p.name} starved and washed back up at the beach.`
    : `${p.name} was killed by ${cause === 'the wilds' ? 'the wilds' : 'a ' + cause} and washed back up at the beach.`;
  broadcast({ t: 'chat', from: '', text: msg });
}

function step() {
  const dt = 1 / TICK_HZ;
  const now = Date.now();
  world.time += dt;

  const settings = world.settings;
  for (const p of world.players.values()) {
    if (settings.hunger) p.hunger = Math.max(0, p.hunger - HUNGER_DRAIN_PS * dt);
    if (settings.hunger && p.hunger <= 0) {
      p.hp -= STARVE_HP_PS * dt;
      p.deathCause = 'starved';
    } else if (p.hunger > REGEN_HUNGER_MIN && p.hp < STATS_MAX) {
      p.hp = Math.min(STATS_MAX, p.hp + REGEN_HP_PS * dt);
    }
    if (p.hp <= 0) respawn(p);

    const sig = `${Math.round(p.hp)}:${Math.round(p.hunger)}`;
    if (sig !== p.lastStatSig) {
      p.lastStatSig = sig;
      sendStats(p);
    }
  }

  for (const s of world.structures.values()) {
    if (s.kind === 'campfire' && s.lit) {
      s.fuelS -= dt;
      if (s.fuelS <= 0) {
        s.fuelS = 0;
        s.lit = false;
        broadcast({ t: 'supd', s });
      }
    }
  }

  if (tickCount % TICK_HZ === 0) { // once per second
    for (const n of world.nodes.values()) {
      if (n.dep && now - n.depAt >= NODE_RESPAWN_MS) {
        n.dep = false;
        n.hp = n.max;
        broadcast({ t: 'node', id: n.id, hp: n.hp, dep: 0 });
      }
    }
  }

  updateDinos(dt, now);

  tickCount++;
  if (tickCount % Math.round(TICK_HZ / SNAP_HZ) === 0) {
    broadcast({
      t: 'snap',
      time: Math.round(world.time * 10) / 10,
      players: [...world.players.values()].map(wirePlayer),
      dinos: wireDinos(),
    });
  }
}

export function startTick() {
  setInterval(step, 1000 / TICK_HZ);
}
