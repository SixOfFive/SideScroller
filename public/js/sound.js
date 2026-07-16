// Procedural sound: everything is synthesized with WebAudio (oscillators +
// filtered noise), no audio files. World events fade with distance. M mutes.

import { on } from './net.js';
import { state, worldTime } from './state.js';
import { PLAYER_W } from '/shared/const.js';
import { DINODEFS } from '/shared/dinodefs.js';
import { bandAt } from '/shared/regions.js';

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
function getNoiseBuf() {
  if (!noiseBuf) {
    noiseBuf = ctx.createBuffer(1, ctx.sampleRate, ctx.sampleRate);
    const d = noiseBuf.getChannelData(0);
    for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
  }
  return noiseBuf;
}

function noise({ dur = 0.1, vol = 0.4, freq = 800, to = null, q = 0.8, type = 'bandpass', delay = 0 }) {
  if (!ac() || muted || vol <= 0.01) return;
  getNoiseBuf();
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
  jump:    () => { noise({ dur: 0.1, vol: 0.16, freq: 480, to: 1100, type: 'bandpass', q: 0.7 }); tone({ freq: 250, to: 390, type: 'sine', dur: 0.08, vol: 0.1 }); },
  land:    (v) => { tone({ freq: 150, to: 70, type: 'triangle', dur: 0.08, vol: 0.3 * v }); noise({ dur: 0.07, vol: 0.2 * v, freq: 380, to: 180, type: 'lowpass' }); },
  splash:  () => { noise({ dur: 0.22, vol: 0.28, freq: 950, to: 320, type: 'lowpass' }); tone({ freq: 620, to: 220, type: 'sine', dur: 0.14, vol: 0.12 }); tone({ freq: 700, to: 1300, type: 'sine', dur: 0.07, vol: 0.07, delay: 0.06 }); },
};

export function sfx(name, x) {
  const fn = SFX[name];
  if (fn) fn(distVol(x));
}

// --- the ambient bed -----------------------------------------------------------
// A quiet, always-there background: looping wind that breathes on slow LFOs,
// bird chirps by day, crickets by night, and a low drone out in the frontier.
// Everything hangs off one `amb.bus` gain under master, so mute still rules,
// and the mix shifts with the biome the player is standing in.

// Per-band multipliers: how birdy / cricketty / windy each biome feels.
const AMBIENCE = {
  meadow:   { birds: 1.0,  crickets: 1.0, wind: 0.5 },
  forest:   { birds: 1.3,  crickets: 1.1, wind: 0.45 },
  hills:    { birds: 0.5,  crickets: 0.7, wind: 1.0 },
  wilds:    { birds: 0.7,  crickets: 0.9, wind: 0.6 },
  badlands: { birds: 0.15, crickets: 0.4, wind: 1.1 },
  strait:   { birds: 0.2,  crickets: 0,   wind: 1.2 },
  jungle:   { birds: 1.5,  crickets: 1.2, wind: 0.35 },
  glacier:  { birds: 0,    crickets: 0,   wind: 1.5 },
  swamp:    { birds: 0.8,  crickets: 1.5, wind: 0.4 },
  volcano:  { birds: 0,    crickets: 0.2, wind: 0.9 },
};
const EXP_MIX = { birds: 0, crickets: 0.4, wind: 1.3, drone: true };
const DEFAULT_MIX = { birds: 0.5, crickets: 0.5, wind: 0.8 };

let amb = null;

function ensureAmbient() {
  if (amb || !ctx) return;
  const bus = ctx.createGain();
  bus.gain.setValueAtTime(0, ctx.currentTime);
  bus.gain.linearRampToValueAtTime(1, ctx.currentTime + 3); // ease the world in
  bus.connect(master);

  // Wind: looped noise through a low rumbly filter. One LFO makes the level
  // breathe, another wanders the filter for gusty texture; regionGain scales
  // the whole thing to the current biome.
  const src = ctx.createBufferSource();
  src.buffer = getNoiseBuf();
  src.loop = true;
  const filt = ctx.createBiquadFilter();
  filt.type = 'lowpass'; filt.frequency.value = 380; filt.Q.value = 0.5;
  const windGain = ctx.createGain();
  windGain.gain.value = 0.05;
  const lfo = ctx.createOscillator();
  lfo.frequency.value = 0.06 + Math.random() * 0.05;
  const lfoG = ctx.createGain();
  lfoG.gain.value = 0.022;
  lfo.connect(lfoG).connect(windGain.gain);
  const lfo2 = ctx.createOscillator();
  lfo2.frequency.value = 0.04 + Math.random() * 0.03;
  const lfo2G = ctx.createGain();
  lfo2G.gain.value = 150;
  lfo2.connect(lfo2G).connect(filt.frequency);
  const regionGain = ctx.createGain();
  regionGain.gain.value = 0.6;
  src.connect(filt).connect(windGain).connect(regionGain).connect(bus);
  src.start(); lfo.start(); lfo2.start();

  const now = performance.now() / 1000;
  amb = { bus, regionGain, nextBird: now + 2, nextCricket: now + 2, nextDrone: now + 8 };
}

// A one-off ambient voice: like tone(), but softer attack, optional stereo
// pan, and routed to the ambient bus instead of straight to master.
function ambNote({ freq, to = null, type = 'sine', dur = 0.1, vol = 0.05, delay = 0, pan = 0, attack = 0.02 }) {
  const t0 = ctx.currentTime + delay;
  const o = ctx.createOscillator();
  const g = ctx.createGain();
  o.type = type;
  o.frequency.setValueAtTime(freq, t0);
  if (to !== null) o.frequency.exponentialRampToValueAtTime(Math.max(20, to), t0 + dur);
  g.gain.setValueAtTime(0, t0);
  g.gain.linearRampToValueAtTime(vol, t0 + attack);
  g.gain.exponentialRampToValueAtTime(0.001, t0 + dur);
  let tail = g;
  if (pan && ctx.createStereoPanner) {
    const p = ctx.createStereoPanner();
    p.pan.value = pan;
    g.connect(p);
    tail = p;
  }
  o.connect(g);
  tail.connect(amb.bus);
  o.start(t0);
  o.stop(t0 + dur + 0.05);
}

// A short songbird phrase: a few quick sweeps somewhere off to one side.
function birdChirp(mul) {
  const pan = (Math.random() * 2 - 1) * 0.8;
  const base = 2300 + Math.random() * 1300;
  const notes = 2 + Math.floor(Math.random() * 3);
  let t = 0;
  for (let i = 0; i < notes; i++) {
    const f = base * (0.9 + Math.random() * 0.25);
    const up = Math.random() < 0.6;
    ambNote({
      freq: f, to: f * (up ? 1.25 : 0.8), type: 'sine',
      dur: 0.05 + Math.random() * 0.08, vol: 0.05 * mul, delay: t, pan,
    });
    t += 0.06 + Math.random() * 0.1;
  }
}

// One cricket: a rapid little pulse train, high and thin.
function cricketChirp(mul) {
  const pan = (Math.random() * 2 - 1) * 0.7;
  const f = 4100 + Math.random() * 500;
  const pulses = 4 + Math.floor(Math.random() * 3);
  for (let i = 0; i < pulses; i++) {
    ambNote({ freq: f, type: 'triangle', dur: 0.022, vol: 0.035 * mul, delay: i * 0.065, pan, attack: 0.006 });
  }
}

// The frontier's voice: a long, low, slightly-detuned swell. Unsettling.
function droneSwell() {
  const f = 48 + Math.random() * 22;
  ambNote({ freq: f, type: 'sine', dur: 2.8, vol: 0.05, attack: 1.2 });
  ambNote({ freq: f * 1.012, type: 'sine', dur: 2.8, vol: 0.035, attack: 1.4 });
}

function ambientTick() {
  // Don't build (or schedule into) a silent world: no context yet, muted, or
  // suspended (autoplay-blocked) — chirps queued while suspended would pile up
  // and all burst out the moment the context resumes.
  if (!ctx || muted || ctx.state !== 'running') return;
  ensureAmbient();
  const band = bandAt(state.me.x + PLAYER_W / 2);
  const mix = band.isExpedition ? EXP_MIX : (AMBIENCE[band.key] || DEFAULT_MIX);
  if (Math.abs((amb.windMul ?? -1) - mix.wind) > 0.01) { // only on biome change — not 60Hz
    amb.windMul = mix.wind;
    amb.regionGain.gain.setTargetAtTime(mix.wind, ctx.currentTime, 1.5);
  }

  const phase = (worldTime() % state.settings.dayLen) / state.settings.dayLen;
  const day = phase < 0.66; // matches the server's nightfall gate
  const now = performance.now() / 1000;
  if (day && mix.birds > 0 && now >= amb.nextBird) {
    amb.nextBird = now + 2.5 + Math.random() * 7 / mix.birds;
    birdChirp(mix.birds);
  }
  if (!day && mix.crickets > 0 && now >= amb.nextCricket) {
    amb.nextCricket = now + 1.2 + Math.random() * 3 / mix.crickets;
    cricketChirp(mix.crickets);
  }
  if (mix.drone && now >= amb.nextDrone) {
    amb.nextDrone = now + 14 + Math.random() * 18;
    droneSwell();
  }
}

// --- movement sounds --------------------------------------------------------------
// Watches the local player's physics state each frame: a fresh jump flips
// grounded with upward velocity, a landing flips it back (thud scales with the
// fall), wading in flips inWater. Mounted riders are server-driven — skip.

let prevGrounded = true, prevWater = false, prevVy = 0;

export function soundTick() {
  const me = state.me;
  if (!me.mounted) {
    if (prevGrounded && !me.grounded && me.vy < -120) sfx('jump');
    if (!prevGrounded && me.grounded && prevVy > 380) SFX.land(Math.min(1, prevVy / 1100));
    if (!prevWater && me.inWater) sfx('splash');
  }
  prevGrounded = me.grounded;
  prevWater = me.inWater;
  prevVy = me.vy;
  ambientTick();
}

// --- event wiring ---------------------------------------------------------------

const NODE_SOUND = { tree: 'chop', rock: 'clink', metal: 'clink', bush: 'rustle' };
const growlAt = new Map(); // dino id -> last growl ms

// Debug handle (same spirit as window.__game): lets a headless check confirm
// the context is running and the ambient bed actually got built.
window.__snd = { get ctx() { return ctx; }, get ambient() { return !!amb; } };

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
