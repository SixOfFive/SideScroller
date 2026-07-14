// Procedural sound: everything is synthesized with WebAudio (oscillators +
// filtered noise), no audio files. World events fade with distance. M mutes.

import { on } from './net.js';
import { state } from './state.js';
import { PLAYER_W } from '/shared/const.js';
import { DINODEFS } from '/shared/dinodefs.js';

let ctx = null;
let master = null;
let muted = localStorage.getItem('ss_mute') === '1';

function ac() {
  if (!ctx) {
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return null;
    ctx = new AC();
    master = ctx.createGain();
    master.gain.value = muted ? 0 : 0.32;
    master.connect(ctx.destination);
  }
  if (ctx.state === 'suspended') ctx.resume();
  return ctx;
}

export function setMute(v) {
  muted = !!v;
  localStorage.setItem('ss_mute', muted ? '1' : '0');
  if (master) master.gain.value = muted ? 0 : 0.32;
  return muted;
}

export function toggleMute() {
  return setMute(!muted);
}

// 0..1 volume based on horizontal distance from the local player.
function distVol(x) {
  if (x === undefined) return 1;
  const d = Math.abs(x - (state.me.x + PLAYER_W / 2));
  return Math.max(0, 1 - d / 950);
}

function tone({ freq = 440, to = null, type = 'sine', dur = 0.1, vol = 0.5, delay = 0 }) {
  if (!ac() || muted || vol <= 0.01) return;
  const t0 = ctx.currentTime + delay;
  const o = ctx.createOscillator();
  const g = ctx.createGain();
  o.type = type;
  o.frequency.setValueAtTime(freq, t0);
  if (to !== null) o.frequency.exponentialRampToValueAtTime(Math.max(20, to), t0 + dur);
  g.gain.setValueAtTime(0, t0);
  g.gain.linearRampToValueAtTime(vol, t0 + 0.008);
  g.gain.exponentialRampToValueAtTime(0.001, t0 + dur);
  o.connect(g).connect(master);
  o.start(t0);
  o.stop(t0 + dur + 0.02);
}

let noiseBuf = null;
function noise({ dur = 0.1, vol = 0.4, freq = 800, to = null, q = 0.8, type = 'bandpass', delay = 0 }) {
  if (!ac() || muted || vol <= 0.01) return;
  if (!noiseBuf) {
    noiseBuf = ctx.createBuffer(1, ctx.sampleRate, ctx.sampleRate);
    const d = noiseBuf.getChannelData(0);
    for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
  }
  const t0 = ctx.currentTime + delay;
  const src = ctx.createBufferSource();
  src.buffer = noiseBuf;
  src.loop = true;
  const f = ctx.createBiquadFilter();
  f.type = type;
  f.Q.value = q;
  f.frequency.setValueAtTime(freq, t0);
  if (to !== null) f.frequency.exponentialRampToValueAtTime(Math.max(40, to), t0 + dur);
  const g = ctx.createGain();
  g.gain.setValueAtTime(0, t0);
  g.gain.linearRampToValueAtTime(vol, t0 + 0.01);
  g.gain.exponentialRampToValueAtTime(0.001, t0 + dur);
  src.connect(f).connect(g).connect(master);
  src.start(t0);
  src.stop(t0 + dur + 0.02);
}

// --- sound recipes ------------------------------------------------------------

const SFX = {
  swing:   () => noise({ dur: 0.09, vol: 0.25, freq: 500, to: 1600, type: 'highpass' }),
  chop:    (v) => { tone({ freq: 190, to: 90, type: 'triangle', dur: 0.08, vol: 0.5 * v }); noise({ dur: 0.06, vol: 0.3 * v, freq: 900 }); },
  clink:   (v) => { tone({ freq: 1150, to: 700, type: 'triangle', dur: 0.06, vol: 0.35 * v }); noise({ dur: 0.05, vol: 0.25 * v, freq: 2400, q: 3 }); },
  rustle:  (v) => noise({ dur: 0.12, vol: 0.3 * v, freq: 1800, to: 900, type: 'highpass' }),
  pickup:  () => { tone({ freq: 660, to: 920, type: 'square', dur: 0.06, vol: 0.14 }); },
  eat:     () => { tone({ freq: 320, to: 240, type: 'triangle', dur: 0.07, vol: 0.3 }); tone({ freq: 260, to: 180, type: 'triangle', dur: 0.08, vol: 0.3, delay: 0.09 }); },
  drink:   () => { tone({ freq: 400, to: 700, type: 'sine', dur: 0.1, vol: 0.25 }); tone({ freq: 500, to: 800, type: 'sine', dur: 0.1, vol: 0.2, delay: 0.12 }); },
  craft:   () => { tone({ freq: 520, type: 'triangle', dur: 0.07, vol: 0.3 }); tone({ freq: 780, type: 'triangle', dur: 0.1, vol: 0.3, delay: 0.08 }); },
  hurt:    () => { tone({ freq: 170, to: 85, type: 'sawtooth', dur: 0.18, vol: 0.5 }); noise({ dur: 0.12, vol: 0.3, freq: 300 }); },
  hit:     (v) => { tone({ freq: 150, to: 70, type: 'triangle', dur: 0.09, vol: 0.4 * v }); },
  bite:    (v) => noise({ dur: 0.08, vol: 0.35 * v, freq: 600, to: 250 }),
  gunshot: (v) => { noise({ dur: 0.16, vol: 0.65 * v, freq: 1200, to: 120, type: 'lowpass' }); tone({ freq: 110, to: 45, type: 'sawtooth', dur: 0.14, vol: 0.45 * v }); },
  poof:    (v) => { noise({ dur: 0.3, vol: 0.35 * v, freq: 500, to: 120 }); tone({ freq: 220, to: 60, type: 'sine', dur: 0.3, vol: 0.3 * v }); },
  heart:   (v) => { tone({ freq: 523, dur: 0.09, vol: 0.22 * v }); tone({ freq: 659, dur: 0.12, vol: 0.22 * v, delay: 0.1 }); },
  build:   (v) => { tone({ freq: 130, to: 80, type: 'triangle', dur: 0.12, vol: 0.5 * v }); noise({ dur: 0.1, vol: 0.25 * v, freq: 500 }); },
  crumble: (v) => noise({ dur: 0.35, vol: 0.4 * v, freq: 700, to: 150 }),
  portal:  () => { tone({ freq: 220, to: 880, type: 'sine', dur: 0.35, vol: 0.35 }); tone({ freq: 227, to: 900, type: 'sine', dur: 0.35, vol: 0.25 }); noise({ dur: 0.4, vol: 0.15, freq: 1200, to: 3200, type: 'highpass' }); },
  death:   () => { tone({ freq: 330, to: 90, type: 'sawtooth', dur: 0.6, vol: 0.4 }); tone({ freq: 165, to: 45, type: 'sine', dur: 0.7, vol: 0.35, delay: 0.1 }); },
  growl:   (v) => { tone({ freq: 75, to: 48, type: 'sawtooth', dur: 0.5, vol: 0.5 * v }); noise({ dur: 0.5, vol: 0.3 * v, freq: 220, to: 90, type: 'lowpass' }); },
};

export function sfx(name, x) {
  const fn = SFX[name];
  if (fn) fn(distVol(x));
}

// --- event wiring ---------------------------------------------------------------

const NODE_SOUND = { tree: 'chop', rock: 'clink', metal: 'clink', bush: 'rustle' };
const growlAt = new Map(); // dino id -> last growl ms

export function initSound() {
  // Browsers require a user gesture before audio can start.
  const kick = () => ac();
  window.addEventListener('pointerdown', kick, { once: true });
  window.addEventListener('keydown', kick, { once: true });

  on('gain', () => sfx('pickup'));
  on('hurt', () => sfx('hurt'));
  on('dead', () => sfx('death'));
  on('tp', () => sfx('portal'));
  on('drank', () => sfx('drink'));
  on('sadd', (m) => sfx('build', m.s.x));
  on('srem', () => sfx('crumble', state.me.x));

  on('node', (m) => {
    const n = state.nodes.get(m.id);
    if (!n || (!m.dep && m.hp >= n.max)) return; // respawn, not a hit
    sfx(NODE_SOUND[n.kind] || 'chop', n.x);
  });

  on('fx', (m) => {
    if (m.kind === 'hit') sfx('hit', m.x);
    else if (m.kind === 'muzzle') sfx('gunshot', m.x);
    else if (m.kind === 'poof') sfx('poof', m.x);
    else if (m.kind === 'heart') sfx('heart', m.x);
  });

  // Predator growls when something aggressive starts hunting nearby.
  on('snap', (m) => {
    const now = performance.now();
    for (const d of m.dinos) {
      if (d.o || (d.s !== 'chase' && d.s !== 'attack')) continue;
      const def = DINODEFS[d.sp];
      if (!def || def.behavior !== 'aggressive') continue;
      const v = distVol(d.x);
      if (v <= 0.05) continue;
      const last = growlAt.get(d.i) || 0;
      if (now - last < 2600) continue;
      growlAt.set(d.i, now);
      sfx('growl', d.x);
    }
    if (growlAt.size > 200) growlAt.clear(); // don't grow forever
  });
}
