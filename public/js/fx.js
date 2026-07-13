// Particles and floating text, in world space. Also emits campfire smoke.

import { on } from './net.js';
import { itemName } from '/shared/items.js';
import { PLAYER_W } from '/shared/const.js';
import { state } from './state.js';

const parts = [];
let floatStack = 0;
let floatStackAt = 0;
let smokeAcc = 0;

export function addFloat(text, color, x, y) {
  const now = performance.now();
  if (now - floatStackAt > 700) floatStack = 0;
  floatStackAt = now;
  parts.push({
    kind: 'float', text, color, x, y: y - floatStack * 16,
    vx: 0, vy: -42, ttl: 1.3, max: 1.3,
  });
  floatStack = (floatStack + 1) % 6; // cycle slots so long harvests don't drift skyward
}

export function addPuff(x, y, color, n = 7) {
  for (let i = 0; i < n; i++) {
    const a = Math.random() * Math.PI * 2;
    const sp = 40 + Math.random() * 90;
    parts.push({
      kind: 'puff', color, x, y,
      vx: Math.cos(a) * sp, vy: Math.sin(a) * sp - 60,
      ttl: 0.5 + Math.random() * 0.25, max: 0.7, size: 3 + Math.random() * 3,
    });
  }
}

export function addHeart(x, y) {
  parts.push({
    kind: 'float', text: '❤', color: '#ff7d9d', x: x + (Math.random() - 0.5) * 20, y,
    vx: (Math.random() - 0.5) * 20, vy: -55, ttl: 1.1, max: 1.1,
  });
}

function addSmoke(x, y) {
  parts.push({
    kind: 'smoke', x: x + (Math.random() - 0.5) * 6, y,
    vx: (Math.random() - 0.5) * 8, vy: -26 - Math.random() * 14,
    ttl: 2.2, max: 2.2, size: 4 + Math.random() * 3,
  });
}

const PUFF_COLORS = { tree: '#8dc26e', rock: '#9aa2b5', bush: '#d9414e' };

on('gain', (m) => {
  addFloat(`+${m.qty} ${itemName(m.item)}`, '#ffd76e',
    state.me.x + PLAYER_W / 2, state.me.y - 24);
});

on('node', (m) => {
  const n = state.nodes.get(m.id);
  if (!n) return;
  const respawned = !m.dep && m.hp >= n.max;
  if (!respawned) addPuff(n.x, m.dep ? 600 : 520, PUFF_COLORS[n.kind] || '#fff');
});

on('fx', (m) => {
  if (m.kind === 'heart') addHeart(m.x, m.y);
  if (m.kind === 'poof') addPuff(m.x, m.y, '#cfd4e0', 12);
  if (m.kind === 'hit') addPuff(m.x, m.y, '#e0654e', 5);
});

export function drawFx(ctx, dt, camX, viewW) {
  // campfire smoke + embers
  smokeAcc += dt;
  if (smokeAcc > 0.14) {
    smokeAcc = 0;
    for (const s of state.structures.values()) {
      if (s.kind === 'campfire' && s.lit && s.x > camX - 100 && s.x < camX + viewW + 100) {
        addSmoke(s.x + 32, s.y + 4);
      }
    }
  }

  for (let i = parts.length - 1; i >= 0; i--) {
    const p = parts[i];
    p.ttl -= dt;
    if (p.ttl <= 0) { parts.splice(i, 1); continue; }
    p.x += p.vx * dt;
    p.y += p.vy * dt;
    const f = p.ttl / p.max;

    if (p.kind === 'float') {
      ctx.globalAlpha = Math.min(1, f * 2);
      ctx.font = 'bold 14px sans-serif';
      ctx.textAlign = 'center';
      ctx.fillStyle = 'rgba(0,0,0,0.6)';
      ctx.fillText(p.text, p.x + 1, p.y + 1);
      ctx.fillStyle = p.color;
      ctx.fillText(p.text, p.x, p.y);
    } else if (p.kind === 'puff') {
      p.vy += 300 * dt;
      ctx.globalAlpha = f;
      ctx.fillStyle = p.color;
      ctx.beginPath(); ctx.arc(p.x, p.y, p.size * (1.6 - f * 0.6), 0, 7); ctx.fill();
    } else if (p.kind === 'smoke') {
      ctx.globalAlpha = f * 0.3;
      ctx.fillStyle = '#c9cdd6';
      ctx.beginPath(); ctx.arc(p.x, p.y, p.size * (2 - f), 0, 7); ctx.fill();
    }
  }
  ctx.globalAlpha = 1;
}
