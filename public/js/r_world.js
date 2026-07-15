// Terrain, water, resource nodes, structures, and the build-mode ghost.
// The ground is a heightmap profile (shared/terrain.js); nodes carry their
// terrain y from the server.

import { STRUCTURES } from '/shared/structures.js';
import { magneticPlacement } from '/shared/place.js';
import { BUILD_REACH, PLAYER_W } from '/shared/const.js';
import { STRAIT_X0, STRAIT_X1 } from '/shared/regions.js';
import { groundAt, grassAt, streamsIn, STREAM_HALF } from '/shared/terrain.js';
import { state } from './state.js';
import { hash01, shade } from './r_bg.js';

const VIEW_H = 720;
const STEP = 8; // terrain sampling stride in px

function idNum(id) {
  let n = 0;
  for (let i = 0; i < id.length; i++) n = n * 31 + id.charCodeAt(i);
  return n >>> 0;
}

export function drawGround(ctx, camX, viewW, br, t) {
  const x0 = Math.floor(camX / STEP) * STEP - STEP;
  const x1 = camX + viewW + STEP;

  // Dirt body under the profile
  ctx.fillStyle = shade(88, 66, 46, br);
  ctx.beginPath();
  ctx.moveTo(x0, VIEW_H);
  for (let x = x0; x <= x1; x += STEP) ctx.lineTo(x, groundAt(x));
  ctx.lineTo(x1, VIEW_H);
  ctx.closePath();
  ctx.fill();

  // Deep dirt shadow band
  ctx.fillStyle = shade(62, 46, 33, br);
  ctx.beginPath();
  ctx.moveTo(x0, VIEW_H);
  for (let x = x0; x <= x1; x += STEP) ctx.lineTo(x, groundAt(x) + 46);
  ctx.lineTo(x1, VIEW_H);
  ctx.closePath();
  ctx.fill();

  // Grass ribbon following the profile, tinted per region
  for (let x = x0; x < x1; x += STEP * 3) {
    const g = grassAt(x);
    ctx.strokeStyle = shade(g[0], g[1], g[2], br);
    ctx.lineWidth = 11;
    ctx.beginPath();
    for (let s = 0; s <= STEP * 3; s += STEP) ctx.lineTo(x + s, groundAt(x + s));
    ctx.stroke();
  }

  // Water in stream basins
  for (const st of streamsIn(camX, camX + viewW)) {
    const left = st.c - STREAM_HALF, right = st.c + STREAM_HALF;
    ctx.fillStyle = `rgba(52,116,${Math.round(170 + br * 60)},${0.55 + br * 0.1})`;
    ctx.beginPath();
    ctx.moveTo(left, st.surface);
    for (let x = left; x <= right; x += 6) {
      const gy = groundAt(x);
      ctx.lineTo(x, Math.max(gy, st.surface));
    }
    ctx.lineTo(right, st.surface);
    ctx.closePath();
    ctx.fill();
    // animated surface glints
    ctx.strokeStyle = `rgba(210,235,255,${0.25 + 0.12 * Math.sin(t * 0.004 + st.c)})`;
    ctx.lineWidth = 2;
    ctx.beginPath();
    for (let i = 0; i < 3; i++) {
      const gx = st.c + Math.sin(t * 0.0011 + i * 2.1) * (STREAM_HALF * 0.55);
      ctx.moveTo(gx - 9, st.surface + 3 + i);
      ctx.lineTo(gx + 9, st.surface + 3 + i);
    }
    ctx.stroke();
  }

  // deterministic decor pinned to the profile
  const start = Math.floor(camX / 44) * 44;
  for (let wx = start; wx < camX + viewW + 44; wx += 44) {
    const h = hash01(wx);
    const gy = groundAt(wx);
    if (h < 0.3) { // grass tuft
      ctx.strokeStyle = shade(70, 130, 52, br);
      ctx.lineWidth = 2;
      ctx.beginPath();
      for (let b = -1; b <= 1; b++) {
        ctx.moveTo(wx, gy - 2);
        ctx.lineTo(wx + b * 4, gy - 12 - h * 8);
      }
      ctx.stroke();
    } else if (h < 0.4) { // pebble
      ctx.fillStyle = shade(120, 124, 134, br);
      ctx.beginPath(); ctx.ellipse(wx, gy - 3, 5, 3, 0, 0, 7); ctx.fill();
    } else if (h < 0.46) { // flower
      ctx.strokeStyle = shade(70, 130, 52, br);
      ctx.beginPath(); ctx.moveTo(wx, gy - 2); ctx.lineTo(wx, gy - 14); ctx.stroke();
      ctx.fillStyle = h < 0.43 ? shade(230, 180, 70, br) : shade(220, 120, 150, br);
      ctx.beginPath(); ctx.arc(wx, gy - 16, 4, 0, 7); ctx.fill();
    }
  }

  drawStrait(ctx, camX, viewW, br, t);
}

// The impassable Sunder Strait: deep sea filling the barrier band, with a
// warning sign on each shore. Players are clamped out of it (physics.js); the
// sea sells why. Only drawn when the barrier band is on-screen.
function drawStrait(ctx, camX, viewW, br, t) {
  const l = Math.max(STRAIT_X0, camX - 40);
  const r = Math.min(STRAIT_X1, camX + viewW + 40);
  if (l < r) {
    const SEA_Y = 452;
    const grd = ctx.createLinearGradient(0, SEA_Y, 0, VIEW_H);
    grd.addColorStop(0, `rgba(${40 + br * 20},${100 + br * 30},${150 + br * 40},0.94)`);
    grd.addColorStop(1, 'rgba(12,36,70,0.99)');
    ctx.fillStyle = grd;
    ctx.fillRect(l, SEA_Y, r - l, VIEW_H - SEA_Y);
    // wavy surface line
    ctx.strokeStyle = `rgba(200,230,255,${0.4 + br * 0.2})`;
    ctx.lineWidth = 2;
    ctx.beginPath();
    for (let x = l; x <= r; x += 10) {
      const yy = SEA_Y + Math.sin(t * 0.003 + x * 0.03) * 4;
      if (x === l) ctx.moveTo(x, yy); else ctx.lineTo(x, yy);
    }
    ctx.stroke();
    // drifting glints
    ctx.strokeStyle = `rgba(220,240,255,${0.18 + 0.1 * Math.sin(t * 0.004)})`;
    const span = Math.max(1, r - l);
    for (let i = 0; i < 8; i++) {
      const gx = l + ((i * 137.5 + t * 0.02) % span);
      const gy = SEA_Y + 20 + i * 7;
      ctx.beginPath(); ctx.moveTo(gx - 8, gy); ctx.lineTo(gx + 8, gy); ctx.stroke();
    }
  }
  // shore signs sit just outside each shore (on solid ground)
  for (const px of [STRAIT_X0 - 70, STRAIT_X1 + 70]) {
    if (px < camX - 30 || px > camX + viewW + 30) continue;
    const gy = groundAt(px);
    ctx.fillStyle = shade(96, 70, 45, br);
    ctx.fillRect(px - 3, gy - 58, 6, 58);
    ctx.fillStyle = shade(150, 60, 52, br);
    ctx.fillRect(px - 24, gy - 66, 48, 22);
    ctx.fillStyle = '#ffe08a';
    ctx.font = 'bold 15px sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText('⚠ portal', px, gy - 51);
  }
}

function drawTree(ctx, n, br) {
  const h = idNum(n.id);
  const s = 0.85 + hash01(h) * 0.45;
  const x = n.x, gy = n.y;
  if (n.dep) {
    ctx.fillStyle = shade(96, 70, 45, br);
    ctx.fillRect(x - 9 * s, gy - 16 * s, 18 * s, 16 * s);
    ctx.fillStyle = shade(120, 92, 60, br);
    ctx.fillRect(x - 9 * s, gy - 16 * s, 18 * s, 4);
    return;
  }
  const top = gy - 170 * s;
  ctx.fillStyle = shade(102, 72, 44, br);
  ctx.beginPath();
  ctx.moveTo(x - 11 * s, gy + 4);
  ctx.lineTo(x - 6 * s, top + 60 * s);
  ctx.lineTo(x + 6 * s, top + 60 * s);
  ctx.lineTo(x + 11 * s, gy + 4);
  ctx.closePath(); ctx.fill();
  const greens = [[63, 125, 50], [78, 148, 64], [53, 107, 42]];
  const hpFrac = n.hp / n.max;
  for (let i = 0; i < 3; i++) {
    const g = greens[(h + i) % 3];
    ctx.fillStyle = shade(g[0], g[1], g[2], br);
    const ox = (hash01(h + i * 7) - 0.5) * 55 * s;
    const oy = (hash01(h + i * 13) - 0.5) * 34 * s;
    ctx.beginPath();
    ctx.arc(x + ox, top + oy, (34 + hash01(h + i) * 18) * s * (0.7 + 0.3 * hpFrac), 0, 7);
    ctx.fill();
  }
}

function drawRock(ctx, n, br) {
  const h = idNum(n.id);
  const s = 0.8 + hash01(h) * 0.5;
  const x = n.x, gy = n.y;
  if (n.dep) {
    ctx.fillStyle = shade(105, 110, 122, br);
    for (let i = 0; i < 4; i++) {
      ctx.beginPath();
      ctx.ellipse(x + (hash01(h + i) - 0.5) * 40, gy - 4, 7, 4, 0, 0, 7);
      ctx.fill();
    }
    return;
  }
  const grays = [[125, 132, 148], [106, 112, 128], [86, 92, 106]];
  for (let i = 0; i < 3; i++) {
    const g = grays[i];
    ctx.fillStyle = shade(g[0], g[1], g[2], br);
    const ox = (i - 1) * 24 * s + (hash01(h + i * 3) - 0.5) * 10;
    const r = (26 - i * 4) * s;
    ctx.beginPath();
    ctx.moveTo(x + ox - r, gy + 3);
    ctx.lineTo(x + ox - r * 0.55, gy - r * (1 + hash01(h + i) * 0.4));
    ctx.lineTo(x + ox + r * 0.5, gy - r * 1.15);
    ctx.lineTo(x + ox + r, gy + 3);
    ctx.closePath(); ctx.fill();
  }
}

function drawMetal(ctx, n, br, t) {
  const h = idNum(n.id);
  const s = 0.9 + hash01(h) * 0.4;
  const x = n.x, gy = n.y;
  if (n.dep) {
    ctx.fillStyle = shade(96, 92, 104, br);
    for (let i = 0; i < 3; i++) {
      ctx.beginPath();
      ctx.ellipse(x + (hash01(h + i) - 0.5) * 34, gy - 4, 8, 4, 0, 0, 7);
      ctx.fill();
    }
    return;
  }
  // dark boulder with glinting ore seams
  ctx.fillStyle = shade(84, 82, 96, br);
  ctx.beginPath();
  ctx.moveTo(x - 30 * s, gy + 3);
  ctx.lineTo(x - 20 * s, gy - 34 * s);
  ctx.lineTo(x + 4 * s, gy - 44 * s);
  ctx.lineTo(x + 26 * s, gy - 22 * s);
  ctx.lineTo(x + 32 * s, gy + 3);
  ctx.closePath(); ctx.fill();
  ctx.fillStyle = shade(66, 64, 78, br);
  ctx.beginPath();
  ctx.moveTo(x - 8 * s, gy + 3);
  ctx.lineTo(x + 2 * s, gy - 40 * s);
  ctx.lineTo(x + 26 * s, gy - 22 * s);
  ctx.lineTo(x + 32 * s, gy + 3);
  ctx.closePath(); ctx.fill();
  const glint = 0.6 + 0.4 * Math.sin(t * 0.006 + h);
  for (let i = 0; i < 5; i++) {
    const ox = (hash01(h + i * 11) - 0.5) * 48 * s;
    const oy = -6 - hash01(h + i * 17) * 30 * s;
    ctx.fillStyle = i % 2
      ? `rgba(232,196,110,${(0.5 + glint * 0.4) * br})`
      : `rgba(210,214,230,${(0.45 + glint * 0.4) * br})`;
    ctx.beginPath(); ctx.arc(x + ox, gy + oy, 2.6, 0, 7); ctx.fill();
  }
}

function drawBush(ctx, n, br) {
  const h = idNum(n.id);
  const x = n.x, gy = n.y;
  if (n.dep) {
    ctx.strokeStyle = shade(110, 82, 52, br);
    ctx.lineWidth = 2;
    ctx.beginPath();
    for (let i = -2; i <= 2; i++) {
      ctx.moveTo(x, gy);
      ctx.lineTo(x + i * 7, gy - 14 - hash01(h + i) * 8);
    }
    ctx.stroke();
    return;
  }
  ctx.fillStyle = shade(62, 124, 51, br);
  ctx.beginPath();
  ctx.ellipse(x, gy - 14, 30, 20, 0, 0, 7);
  ctx.ellipse(x - 16, gy - 8, 18, 13, 0, 0, 7);
  ctx.ellipse(x + 16, gy - 8, 18, 13, 0, 0, 7);
  ctx.fill();
  const berries = n.hp / n.max > 0.5 ? 6 : 2;
  ctx.fillStyle = shade(217, 65, 78, br);
  for (let i = 0; i < berries; i++) {
    ctx.beginPath();
    ctx.arc(x + (hash01(h + i * 5) - 0.5) * 46, gy - 10 - hash01(h + i * 9) * 18, 3.4, 0, 7);
    ctx.fill();
  }
}

function nodeBar(ctx, n) {
  if (!n.lastHit || performance.now() - n.lastHit > 2800 || n.dep) return;
  const w = 52, x = n.x - w / 2, y = n.y - 190;
  ctx.fillStyle = 'rgba(0,0,0,0.55)';
  ctx.fillRect(x - 1, y - 1, w + 2, 8);
  ctx.fillStyle = '#7ec96a';
  ctx.fillRect(x, y, w * (n.hp / n.max), 6);
}

export function drawNodes(ctx, camX, viewW, br, t) {
  for (const n of state.nodes.values()) {
    if (n.x < camX - 150 || n.x > camX + viewW + 150) continue;
    if (n.kind === 'tree') drawTree(ctx, n, br);
    else if (n.kind === 'rock') drawRock(ctx, n, br);
    else if (n.kind === 'metal') drawMetal(ctx, n, br, t);
    else drawBush(ctx, n, br);
    nodeBar(ctx, n);
  }
}

function thatchPanel(ctx, x, y, w, h, br, vertical) {
  ctx.fillStyle = shade(194, 163, 95, br);
  ctx.fillRect(x, y, w, h);
  ctx.strokeStyle = shade(168, 135, 74, br);
  ctx.lineWidth = 1.5;
  ctx.beginPath();
  if (vertical) {
    for (let i = 6; i < w; i += 7) { ctx.moveTo(x + i, y + 2); ctx.lineTo(x + i - 2, y + h - 2); }
  } else {
    for (let i = 4; i < h; i += 5) { ctx.moveTo(x + 2, y + i); ctx.lineTo(x + w - 2, y + i); }
  }
  ctx.stroke();
  ctx.strokeStyle = shade(107, 74, 47, br);
  ctx.lineWidth = 3;
  ctx.strokeRect(x + 1, y + 1, w - 2, h - 2);
}

export function drawStructure(ctx, s, br, t, alpha = 1) {
  const def = STRUCTURES[s.kind];
  ctx.save();
  ctx.globalAlpha = alpha;
  if (s.kind === 'campfire') {
    const cx = s.x + def.w / 2, base = s.y + def.h;
    ctx.fillStyle = shade(96, 70, 45, br);
    ctx.save();
    ctx.translate(cx, base - 8);
    ctx.rotate(0.5); ctx.fillRect(-16, -3, 32, 6);
    ctx.rotate(-1.0); ctx.fillRect(-16, -3, 32, 6);
    ctx.restore();
    ctx.fillStyle = shade(112, 118, 132, br);
    for (let i = 0; i < 5; i++) {
      const a = Math.PI * (0.15 + (i / 4) * 0.7);
      ctx.beginPath();
      ctx.ellipse(cx + Math.cos(a) * 26, base - 3 - Math.sin(a) * 4, 7, 5, 0, 0, 7);
      ctx.fill();
    }
    if (s.lit) {
      const fl = 1 + Math.sin(t * 0.02 + s.x) * 0.15;
      const grd = ctx.createRadialGradient(cx, base - 14, 2, cx, base - 14, 60 * fl);
      grd.addColorStop(0, 'rgba(255,180,60,0.5)');
      grd.addColorStop(1, 'rgba(255,180,60,0)');
      ctx.fillStyle = grd;
      ctx.fillRect(cx - 60, base - 74, 120, 74);
      ctx.fillStyle = '#ff8c2e';
      ctx.beginPath();
      ctx.moveTo(cx - 10, base - 8);
      ctx.quadraticCurveTo(cx - 8, base - 26 * fl, cx, base - 34 * fl);
      ctx.quadraticCurveTo(cx + 8, base - 26 * fl, cx + 10, base - 8);
      ctx.closePath(); ctx.fill();
      ctx.fillStyle = '#ffd23e';
      ctx.beginPath();
      ctx.moveTo(cx - 5, base - 8);
      ctx.quadraticCurveTo(cx - 4, base - 16 * fl, cx, base - 21 * fl);
      ctx.quadraticCurveTo(cx + 4, base - 16 * fl, cx + 5, base - 8);
      ctx.closePath(); ctx.fill();
    }
  } else if (s.kind === 'storage_box') {
    ctx.fillStyle = shade(122, 82, 51, br);
    ctx.fillRect(s.x, s.y + 10, def.w, def.h - 10);
    ctx.fillStyle = shade(145, 100, 62, br);
    ctx.fillRect(s.x - 2, s.y, def.w + 4, 14);
    ctx.fillStyle = shade(70, 74, 84, br);
    ctx.fillRect(s.x + def.w / 2 - 4, s.y + 8, 8, 12);
    ctx.strokeStyle = shade(80, 52, 30, br);
    ctx.strokeRect(s.x, s.y + 10, def.w, def.h - 10);
  } else if (s.kind === 'foundation' || s.kind === 'roof') {
    thatchPanel(ctx, s.x, s.y, def.w, def.h, br, false);
  } else if (s.kind === 'wall') {
    thatchPanel(ctx, s.x, s.y, def.w, def.h, br, true);
  } else if (s.kind === 'doorframe') {
    thatchPanel(ctx, s.x, s.y, 24, def.h, br, true);
    thatchPanel(ctx, s.x + def.w - 24, s.y, 24, def.h, br, true);
    thatchPanel(ctx, s.x + 20, s.y, def.w - 40, 20, br, false);
  } else if (s.kind === 'forge') {
    // stone furnace with a glowing mouth
    ctx.fillStyle = shade(96, 96, 108, br);
    ctx.fillRect(s.x, s.y + 8, def.w, def.h - 8);
    ctx.fillStyle = shade(74, 74, 86, br);
    ctx.fillRect(s.x + 4, s.y, def.w - 8, 12);
    const lit = s.lit;
    ctx.fillStyle = lit ? '#ff9a3c' : shade(40, 34, 34, br);
    ctx.fillRect(s.x + def.w / 2 - 12, s.y + def.h - 26, 24, 18);
    if (lit) {
      const grd = ctx.createRadialGradient(s.x + def.w / 2, s.y + def.h - 17, 2, s.x + def.w / 2, s.y + def.h - 17, 40);
      grd.addColorStop(0, 'rgba(255,150,50,0.5)'); grd.addColorStop(1, 'rgba(255,150,50,0)');
      ctx.fillStyle = grd; ctx.fillRect(s.x - 20, s.y - 20, def.w + 40, def.h + 30);
      ctx.fillStyle = 'rgba(90,70,80,0.5)';
      for (let i = 0; i < 3; i++) {
        const sy = s.y - 6 - ((t * 0.02 + i * 20 + s.x) % 40);
        ctx.beginPath(); ctx.arc(s.x + def.w / 2 + Math.sin(sy * 0.1) * 6, sy, 4, 0, 7); ctx.fill();
      }
    }
  } else if (s.kind === 'portal') {
    const cx = s.x + def.w / 2, cy = s.y + def.h / 2;
    const hue = s.hue ?? 200;
    // stone frame
    ctx.strokeStyle = shade(120, 122, 134, br);
    ctx.lineWidth = 8;
    ctx.beginPath(); ctx.ellipse(cx, cy, def.w / 2, def.h / 2, 0, 0, 7); ctx.stroke();
    // swirling vortex
    const glow = ctx.createRadialGradient(cx, cy, 4, cx, cy, def.w / 2);
    glow.addColorStop(0, `hsla(${hue},80%,80%,0.95)`);
    glow.addColorStop(0.6, `hsla(${hue},75%,55%,0.75)`);
    glow.addColorStop(1, `hsla(${hue},70%,35%,0.35)`);
    ctx.fillStyle = glow;
    ctx.beginPath(); ctx.ellipse(cx, cy, def.w / 2 - 5, def.h / 2 - 5, 0, 0, 7); ctx.fill();
    ctx.strokeStyle = `hsla(${hue},90%,85%,0.5)`;
    ctx.lineWidth = 2;
    for (let i = 0; i < 3; i++) {
      ctx.beginPath();
      for (let a = 0; a < 6.3; a += 0.3) {
        const rr = (a / 6.3) * (def.w / 2 - 8);
        const ang = a * 2 + t * 0.003 + i * 2.1;
        const px = cx + Math.cos(ang) * rr, py = cy + Math.sin(ang) * rr * (def.h / def.w);
        if (a === 0) ctx.moveTo(px, py); else ctx.lineTo(px, py);
      }
      ctx.stroke();
    }
    // label
    ctx.font = '700 13px sans-serif';
    ctx.textAlign = 'center';
    ctx.fillStyle = 'rgba(0,0,0,0.6)';
    ctx.fillText(s.label || 'Portal', cx + 1, s.y - 7);
    ctx.fillStyle = `hsl(${hue},85%,${55 + br * 25}%)`;
    ctx.fillText(s.label || 'Portal', cx, s.y - 8);
  }
  ctx.restore();
}

export function drawStructures(ctx, camX, viewW, br, t) {
  for (const s of state.structures.values()) {
    const def = STRUCTURES[s.kind];
    if (s.x + def.w < camX - 100 || s.x > camX + viewW + 100) continue;
    drawStructure(ctx, s, br, t);
  }
}

export function drawBuildGhost(ctx, wantX, br, t) {
  if (!state.build) return null;
  const def = STRUCTURES[state.build];
  const meC = state.me.x + PLAYER_W / 2;

  // Dotted baseline along the stretch of ground within building reach, so the
  // limit is visible before a click gets refused.
  ctx.save();
  ctx.strokeStyle = 'rgba(140, 220, 160, 0.4)';
  ctx.lineWidth = 2;
  ctx.setLineDash([6, 8]);
  ctx.beginPath();
  ctx.moveTo(meC - BUILD_REACH, groundAt(meC - BUILD_REACH) - 5);
  for (let x = meC - BUILD_REACH + 24; x <= meC + BUILD_REACH; x += 24) {
    ctx.lineTo(x, groundAt(x) - 5);
  }
  ctx.stroke();
  ctx.restore();

  // Magnetic: blocked free-standing spots slide to the nearest clear gap.
  const res = magneticPlacement(state.build, wantX, state.structures.values());
  if (res.x === undefined) return res;
  const gy = res.y || groundAt(res.x + def.w / 2) - def.h;
  const tooFar = Math.abs(res.x + def.w / 2 - meC) > BUILD_REACH;
  const ok = res.ok && !tooFar;
  drawStructure(ctx, { kind: state.build, x: res.x, y: gy, lit: false }, br, t, 0.55);
  ctx.fillStyle = ok ? 'rgba(90,220,120,0.25)' : 'rgba(230,70,70,0.3)';
  ctx.fillRect(res.x, gy, def.w, def.h);
  const msg = !res.ok ? res.reason : tooFar ? 'Too far — walk closer' : null;
  if (msg) {
    ctx.font = 'bold 13px sans-serif';
    ctx.textAlign = 'center';
    ctx.fillStyle = '#ff9d9d';
    ctx.fillText(msg, res.x + def.w / 2, gy - 8);
  }
  return res;
}
