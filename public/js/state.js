// Client-side world model: applies server messages, interpolates remote
// entities, and answers "what's near me" queries for interaction.

import { on } from './net.js';
import { PLAYER_W, PLAYER_H } from '/shared/const.js';
import { STRUCTURES } from '/shared/structures.js';

const INTERP_DELAY_MS = 120;

export const state = {
  joined: false,
  id: null,
  name: '',
  worldW: 16000,
  time: 60,               // server world-clock anchor…
  timeAt: 0,              // …captured at this performance.now()
  nodes: new Map(),
  structures: new Map(),
  players: new Map(),     // remote players only
  dinos: new Map(),
  me: {
    x: 0, y: 0, vx: 0, vy: 0, grounded: true, face: 1, anim: 'idle',
    swingT: 0, hp: 100, hunger: 100, inv: {}, equip: '',
  },
  build: null,            // active build kind while in build mode
  hoverNode: null,
};

export function worldTime() {
  return state.time + (performance.now() - state.timeAt) / 1000;
}

function upsertRemote(w) {
  let p = state.players.get(w.i);
  if (!p) {
    p = { buf: [] };
    state.players.set(w.i, p);
  }
  Object.assign(p, w);
  p.buf.push({ t: performance.now(), x: w.x, y: w.y });
  if (p.buf.length > 12) p.buf.shift();
}

function upsertDino(w) {
  let d = state.dinos.get(w.i);
  if (!d) {
    d = { buf: [] };
    state.dinos.set(w.i, d);
  }
  Object.assign(d, w);
  d.buf.push({ t: performance.now(), x: w.x, y: w.y });
  if (d.buf.length > 12) d.buf.shift();
}

// Interpolated draw position for anything with a .buf of snapshots.
export function interp(e) {
  const buf = e.buf;
  if (!buf || !buf.length) return { x: e.x, y: e.y };
  const target = performance.now() - INTERP_DELAY_MS;
  for (let i = buf.length - 1; i > 0; i--) {
    if (buf[i - 1].t <= target) {
      const a = buf[i - 1], b = buf[i];
      const f = Math.min(1, Math.max(0, (target - a.t) / Math.max(1, b.t - a.t)));
      return { x: a.x + (b.x - a.x) * f, y: a.y + (b.y - a.y) * f };
    }
  }
  // Whole buffer is newer than the render target: hold the oldest sample so
  // the entity doesn't pop backward when interpolation kicks in.
  return { x: buf[0].x, y: buf[0].y };
}

export function meCenter() {
  return state.me.x + PLAYER_W / 2;
}

export function findNearestNode(range) {
  const cx = meCenter();
  let best = null, bestD = range;
  for (const n of state.nodes.values()) {
    if (n.dep) continue;
    const d = Math.abs(n.x - cx);
    if (d < bestD) { bestD = d; best = n; }
  }
  return best;
}

export function findNearestStructure(range, kinds = null) {
  const cx = meCenter();
  const my = state.me.y + PLAYER_H / 2;
  let best = null, bestD = range;
  for (const s of state.structures.values()) {
    if (kinds && !kinds.includes(s.kind)) continue;
    const def = STRUCTURES[s.kind];
    const d = Math.abs(s.x + def.w / 2 - cx);
    if (d < bestD && Math.abs(s.y + def.h / 2 - my) < 220) { bestD = d; best = s; }
  }
  return best;
}

export function findNearestDino(range, filter = null) {
  const cx = meCenter();
  let best = null, bestD = range;
  for (const d of state.dinos.values()) {
    if (filter && !filter(d)) continue;
    const pos = interp(d);
    const dist = Math.abs(pos.x - cx);
    if (dist < bestD) { bestD = dist; best = d; }
  }
  return best;
}

// --- message handlers -------------------------------------------------------

on('welcome', (m) => {
  state.id = m.id;
  state.name = m.name;
  state.worldW = m.worldW;
  state.time = m.time;
  state.timeAt = performance.now();
  state.nodes.clear();
  state.structures.clear();
  state.players.clear();
  state.dinos.clear();
  for (const n of m.nodes) state.nodes.set(n.id, n);
  for (const s of m.structures) state.structures.set(s.id, stampFuel(s));
  for (const p of m.players) upsertRemote(p);
  for (const d of m.dinos) upsertDino(d);
  Object.assign(state.me, {
    x: m.you.x, y: m.you.y, vx: 0, vy: 0,
    hp: m.you.stats.hp, hunger: m.you.stats.hunger,
    inv: m.you.inv, equip: m.you.equip,
  });
  state.joined = true;
});

on('snap', (m) => {
  state.time = m.time;
  state.timeAt = performance.now();
  const seen = new Set();
  for (const w of m.players) {
    if (w.i === state.id) continue;
    seen.add(w.i);
    upsertRemote(w);
  }
  for (const id of state.players.keys()) if (!seen.has(id)) state.players.delete(id);
  const dseen = new Set();
  for (const w of m.dinos) { dseen.add(w.i); upsertDino(w); }
  for (const id of state.dinos.keys()) if (!dseen.has(id)) state.dinos.delete(id);
});

on('pjoin', (m) => { if (m.p.i !== state.id) upsertRemote(m.p); });
on('pleave', (m) => state.players.delete(m.id));

on('node', (m) => {
  const n = state.nodes.get(m.id);
  if (!n) return;
  if (m.hp < n.hp) n.lastHit = performance.now();
  n.hp = m.hp;
  n.dep = !!m.dep;
});

// Stamp arrival time of fuel values so the HUD can run a local countdown.
function stampFuel(s) {
  if (s.fuelS !== undefined) s.fuelAt = performance.now();
  return s;
}

on('sadd', (m) => state.structures.set(m.s.id, stampFuel(m.s)));
on('supd', (m) => {
  const cur = state.structures.get(m.s.id);
  stampFuel(m.s);
  state.structures.set(m.s.id, cur ? Object.assign(cur, m.s) : m.s);
});
on('srem', (m) => state.structures.delete(m.id));

on('inv', (m) => { state.me.inv = m.inv; state.me.equip = m.equip; });
on('stats', (m) => { state.me.hp = m.hp; state.me.hunger = m.hunger; });

on('dead', (m) => {
  state.me.x = m.x;
  state.me.y = m.y;
  state.me.vx = 0;
  state.me.vy = 0;
});
