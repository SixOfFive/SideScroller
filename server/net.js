// WebSocket connection lifecycle: join/leave, heartbeat, rate limiting, and
// the small send helpers the game logic uses. Message routing is injected via
// initNet to avoid circular imports.
//
// Identity: the client sends a per-browser secret token with join; a profile
// is bound to the first token that claims it, so a bare name can't hijack an
// offline survivor's inventory and base. The same token may take over its own
// live session (fixes zombie connections blocking reconnect).

import { WebSocketServer } from 'ws';
import { createHash } from 'node:crypto';
import { world, newId, syncProfile } from './state.js';
import { wireDinos } from './dinos.js';
import {
  MAX_PLAYERS, NAME_MAX, SPAWN_X, PLAYER_H, WORLD_W, STATS_MAX,
} from '../shared/const.js';
import { groundAt } from '../shared/terrain.js';

const JOIN_TIMEOUT_MS = 10000;
const HEARTBEAT_MS = 10000;
const RATE_CAP = 60;          // burst
const RATE_PER_MS = 0.03;     // 30 msg/s sustained

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
    f: p.face, a: p.anim, h: Math.round(p.hp), e: p.equip,
  };
}

function refuse(ws, msg) {
  sendRaw(ws, { t: 'joinErr', msg });
  ws.close();
  return null;
}

function doJoin(ws, msg) {
  const name = String(msg.name ?? '').replace(/[^\w \-']/g, '').trim().slice(0, NAME_MAX);
  if (!name) return refuse(ws, 'Enter a name');
  const key = name.toLowerCase();
  const tokenHash = createHash('sha256').update(String(msg.token ?? '')).digest('hex');

  const saved = world.profiles[key];
  if (saved && saved.tokenHash && saved.tokenHash !== tokenHash) {
    return refuse(ws, 'That survivor belongs to another player');
  }
  for (const other of world.players.values()) {
    if (other.key === key) {
      if (other.tokenHash !== tokenHash) return refuse(ws, 'That name is already playing');
      leave(other); // same browser reconnecting: save + drop the old session
      try { other.ws.terminate(); } catch {}
      break;
    }
  }
  if (world.players.size >= MAX_PLAYERS) {
    return refuse(ws, `Server full (${MAX_PLAYERS} max)`);
  }

  const prof = world.profiles[key]; // re-read: leave() above may have synced it
  const p = {
    id: newId('p'), key, ws, tokenHash,
    name: prof && typeof prof.name === 'string' ? prof.name : name,
    x: Number.isFinite(prof?.x) ? prof.x : SPAWN_X + Math.random() * 200,
    y: Number.isFinite(prof?.y) ? prof.y
      : groundAt(SPAWN_X + 100) - PLAYER_H - 40, // drop in just above the meadow

    vx: 0, face: 1, anim: 'idle',
    hp: Number.isFinite(prof?.stats?.hp) ? prof.stats.hp : STATS_MAX,
    hunger: Number.isFinite(prof?.stats?.hunger) ? prof.stats.hunger : STATS_MAX,
    inv: prof && prof.inv && typeof prof.inv === 'object' ? prof.inv : {},
    equip: typeof prof?.equip === 'string' ? prof.equip : '',
    lastSwing: 0, lastChat: 0, lastStatSig: '',
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
  if (!world.players.has(p.id)) return; // idempotent: takeover + close both call this
  syncProfile(p);
  world.players.delete(p.id);
  broadcast({ t: 'pleave', id: p.id });
  broadcast({ t: 'chat', from: '', text: `${p.name} left.` });
  console.log(`leave: ${p.name}`);
}

export function initNet(httpServer, route) {
  const wss = new WebSocketServer({ server: httpServer, maxPayload: 16 * 1024 });

  const heartbeat = setInterval(() => {
    for (const ws of wss.clients) {
      if (!ws.isAlive) { ws.terminate(); continue; }
      ws.isAlive = false;
      ws.ping();
    }
  }, HEARTBEAT_MS);
  wss.on('close', () => clearInterval(heartbeat));

  wss.on('connection', (ws) => {
    ws.isAlive = true;
    ws.on('pong', () => { ws.isAlive = true; });

    let player = null;
    let tokens = RATE_CAP;
    let lastRefill = Date.now();
    const joinTimer = setTimeout(() => { if (!player) ws.terminate(); }, JOIN_TIMEOUT_MS);

    ws.on('message', (data) => {
      const now = Date.now();
      tokens = Math.min(RATE_CAP, tokens + (now - lastRefill) * RATE_PER_MS);
      lastRefill = now;
      if (tokens < 1) {
        tokens -= 0.5;
        if (tokens < -30) ws.terminate(); // sustained flood
        return;
      }
      tokens -= 1;

      let msg;
      try { msg = JSON.parse(data); } catch { return; }
      if (!msg || typeof msg.t !== 'string') return;
      if (!player) {
        if (msg.t === 'join') {
          try {
            player = doJoin(ws, msg);
          } catch (e) {
            console.error('join failed:', e);
            try { ws.close(); } catch {}
          }
          if (player) clearTimeout(joinTimer);
        }
        return;
      }
      route(player, msg);
    });

    ws.on('close', () => {
      clearTimeout(joinTimer);
      if (player) {
        try {
          leave(player);
        } catch (e) {
          console.error('leave failed:', e);
          world.players.delete(player.id);
        }
        player = null;
      }
    });
    ws.on('error', () => {});
  });
}
