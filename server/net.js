// WebSocket connection lifecycle: join/leave, plus all the small send helpers
// the game logic uses. Message routing is injected via initNet to avoid
// circular imports.

import { WebSocketServer } from 'ws';
import { world, newId, syncProfile } from './state.js';
import { wireDinos } from './dinos.js';
import {
  MAX_PLAYERS, NAME_MAX, SPAWN_X, GROUND_Y, PLAYER_H, PLAYER_W, WORLD_W, STATS_MAX,
} from '../shared/const.js';

function sendRaw(ws, msg) {
  if (ws.readyState === 1) ws.send(JSON.stringify(msg));
}

export function send(p, msg) { sendRaw(p.ws, msg); }
export function toast(p, msg) { send(p, { t: 'toast', msg }); }
export function sendInv(p) { send(p, { t: 'inv', inv: p.inv, equip: p.equip }); }
export function sendStats(p) {
  send(p, { t: 'stats', hp: Math.round(p.hp), hunger: Math.round(p.hunger) });
}

export function broadcast(msg, exceptId = null) {
  const s = JSON.stringify(msg);
  for (const p of world.players.values()) {
    if (p.id !== exceptId && p.ws.readyState === 1) p.ws.send(s);
  }
}

export function wirePlayer(p) {
  return {
    i: p.id, n: p.name,
    x: Math.round(p.x), y: Math.round(p.y), vx: Math.round(p.vx),
    f: p.face, a: p.anim, h: Math.round(p.hp),
  };
}

function doJoin(ws, msg) {
  const name = String(msg.name ?? '').replace(/[^\w \-']/g, '').trim().slice(0, NAME_MAX);
  if (!name) { sendRaw(ws, { t: 'joinErr', msg: 'Enter a name' }); ws.close(); return null; }
  const key = name.toLowerCase();
  for (const other of world.players.values()) {
    if (other.key === key) {
      sendRaw(ws, { t: 'joinErr', msg: 'That name is already playing' });
      ws.close();
      return null;
    }
  }
  if (world.players.size >= MAX_PLAYERS) {
    sendRaw(ws, { t: 'joinErr', msg: `Server full (${MAX_PLAYERS} max)` });
    ws.close();
    return null;
  }

  const prof = world.profiles[key];
  const p = {
    id: newId('p'), key, ws,
    name: prof ? prof.name : name,
    x: prof ? prof.x : SPAWN_X + Math.random() * 200,
    y: prof ? prof.y : GROUND_Y - PLAYER_H,
    vx: 0, face: 1, anim: 'idle',
    hp: prof ? prof.stats.hp : STATS_MAX,
    hunger: prof ? prof.stats.hunger : STATS_MAX,
    inv: prof ? prof.inv : {},
    equip: prof ? prof.equip : '',
    lastSwing: 0, lastStatSig: '',
  };
  world.players.set(p.id, p);

  send(p, {
    t: 'welcome',
    id: p.id, name: p.name, worldW: WORLD_W, time: world.time,
    nodes: [...world.nodes.values()],
    structures: [...world.structures.values()],
    dinos: wireDinos(),
    players: [...world.players.values()].filter((o) => o.id !== p.id).map(wirePlayer),
    you: { x: p.x, y: p.y, inv: p.inv, stats: { hp: p.hp, hunger: p.hunger }, equip: p.equip },
  });
  broadcast({ t: 'pjoin', p: wirePlayer(p) }, p.id);
  broadcast({ t: 'chat', from: '', text: `${p.name} washed up on the beach.` });
  console.log(`join: ${p.name} (${world.players.size}/${MAX_PLAYERS})`);
  return p;
}

function leave(p) {
  syncProfile(p);
  world.players.delete(p.id);
  broadcast({ t: 'pleave', id: p.id });
  broadcast({ t: 'chat', from: '', text: `${p.name} left.` });
  console.log(`leave: ${p.name}`);
}

export function initNet(httpServer, route) {
  const wss = new WebSocketServer({ server: httpServer });
  wss.on('connection', (ws) => {
    let player = null;
    ws.on('message', (data) => {
      let msg;
      try { msg = JSON.parse(data); } catch { return; }
      if (!msg || typeof msg.t !== 'string') return;
      if (!player) {
        if (msg.t === 'join') player = doJoin(ws, msg);
        return;
      }
      route(player, msg);
    });
    ws.on('close', () => { if (player) { leave(player); player = null; } });
    ws.on('error', () => {});
  });
}
