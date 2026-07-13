// Ground, resource nodes, structures, and the build-mode ghost.
// Everything is drawn procedurally; node variety comes from hashing ids.

import { GROUND_Y } from '/shared/const.js';
import { STRUCTURES } from '/shared/structures.js';
import { computePlacement } from '/shared/place.js';
import { state } from './state.js';
import { hash01, shade } from './r_bg.js';

const VIEW_H = 720;

function idNum(id) {
  let n = 0;
  for (let i = 0; i < id.length; i++) n = n * 31 + id.charCodeAt(i);
  return n >>> 0;
}

export function drawGround(ctx, camX, viewW, br, t) {
  ctx.fillStyle = shade(88, 66, 46, br);
  ctx.fillRect(camX, GROUND_Y, viewW, VIEW_H - GROUND_Y);
  ctx.fillStyle = shade(62, 46, 33, br);
  ctx.fillRect(camX, GROUND_Y + 42, viewW, VIEW_H - GROUND_Y - 42);
  ctx.fillStyle = shade(78, 143, 58, br);
  ctx.fillRect(camX, GROUND_Y - 6, viewW, 14);
  ctx.fillStyle = shade(58, 110, 44, br);
  ctx.fillRect(camX, GROUND_Y + 6, viewW, 4);

  // deterministic decor
  const start = Math.floor(camX / 44) * 44;
  for (let wx = start; wx < camX + viewW + 44; wx += 44) {
    const h = hash01(wx);
    if (h < 0.3) { // grass tuft
      ctx.strokeStyle = shade(70, 130, 52, br);
      ctx.lineWidth = 2;
      ctx.beginPath();
      for (let b = -1; b <= 1; b++) {
        ctx.moveTo(wx, GROUND_Y - 2);
        ctx.lineTo(wx + b * 4, GROUND_Y - 12 - h * 8);
      }
      ctx.stroke();
    } else if (h < 0.4) { // pebble
      ctx.fillStyle = shade(120, 124, 134, br);
      ctx.beginPath(); ctx.ellipse(wx, GROUND_Y - 3, 5, 3, 0, 0, 7); ctx.fill();
    } else if (h < 0.46) { // flower
      ctx.strokeStyle = shade(70, 130, 52, br);
      ctx.beginPath(); ctx.moveTo(wx, GROUND_Y - 2); ctx.lineTo(wx, GROUND_Y - 14); ctx.stroke();
      ctx.fillStyle = h < 0.43 ? shade(230, 180, 70, br) : shade(220, 120, 150, br);
      ctx.beginPath(); ctx.arc(wx, GROUND_Y - 16, 4, 0, 7); ctx.fill();
    }
  }
}

function drawTree(ctx, n, br) {
  const h = idNum(n.id);
  const s = 0.85 + hash01(h) * 0.45;
  const x = n.x;
  if (n.dep) {
    ctx.fillStyle = shade(96, 70, 45, br);
    ctx.fillRect(x - 9 * s, GROUND_Y - 16 * s, 18 * s, 16 * s);
    ctx.fillStyle = shade(120, 92, 60, br);
    ctx.fillRect(x - 9 * s, GROUND_Y - 16 * s, 18 * s, 4);
    return;
  }
  const top = GROUND_Y - 170 * s;
  ctx.fillStyle = shade(102, 72, 44, br);
  ctx.beginPath();
  ctx.moveTo(x - 11 * s, GROUND_Y);
  ctx.lineTo(x - 6 * s, top + 60 * s);
  ctx.lineTo(x + 6 * s, top + 60 * s);
  ctx.lineTo(x + 11 * s, GROUND_Y);
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
  const x = n.x;
  if (n.dep) {
    ctx.fillStyle = shade(105, 110, 122, br);
    for (let i = 0; i < 4; i++) {
      ctx.beginPath();
      ctx.ellipse(x + (hash01(h + i) - 0.5) * 40, GROUND_Y - 4, 7, 4, 0, 0, 7);
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
    ctx.moveTo(x + ox - r, GROUND_Y);
    ctx.lineTo(x + ox - r * 0.55, GROUND_Y - r * (1 + hash01(h + i) * 0.4));
    ctx.lineTo(x + ox + r * 0.5, GROUND_Y - r * 1.15);
    ctx.lineTo(x + ox + r, GROUND_Y);
    ctx.closePath(); ctx.fill();
  }
}

function drawBush(ctx, n, br) {
  const h = idNum(n.id);
  const x = n.x;
  if (n.dep) {
    ctx.strokeStyle = shade(110, 82, 52, br);
    ctx.lineWidth = 2;
    ctx.beginPath();
    for (let i = -2; i <= 2; i++) {
      ctx.moveTo(x, GROUND_Y);
      ctx.lineTo(x + i * 7, GROUND_Y - 14 - hash01(h + i) * 8);
    }
    ctx.stroke();
    return;
  }
  ctx.fillStyle = shade(62, 124, 51, br);
  ctx.beginPath();
  ctx.ellipse(x, GROUND_Y - 14, 30, 20, 0, 0, 7);
  ctx.ellipse(x - 16, GROUND_Y - 8, 18, 13, 0, 0, 7);
  ctx.ellipse(x + 16, GROUND_Y - 8, 18, 13, 0, 0, 7);
  ctx.fill();
  const berries = n.hp / n.max > 0.5 ? 6 : 2;
  ctx.fillStyle = shade(217, 65, 78, br);
  for (let i = 0; i < berries; i++) {
    ctx.beginPath();
    ctx.arc(x + (hash01(h + i * 5) - 0.5) * 46, GROUND_Y - 10 - hash01(h + i * 9) * 18, 3.4, 0, 7);
    ctx.fill();
  }
}

function nodeBar(ctx, n) {
  if (!n.lastHit || performance.now() - n.lastHit > 2800 || n.dep) return;
  const w = 52, x = n.x - w / 2, y = GROUND_Y - 200;
  ctx.fillStyle = 'rgba(0,0,0,0.55)';
  ctx.fillRect(x - 1, y - 1, w + 2, 8);
  ctx.fillStyle = '#7ec96a';
  ctx.fillRect(x, y, w * (n.hp / n.max), 6);
}

export function drawNodes(ctx, camX, viewW, br) {
  for (const n of state.nodes.values()) {
    if (n.x < camX - 150 || n.x > camX + viewW + 150) continue;
    if (n.kind === 'tree') drawTree(ctx, n, br);
    else if (n.kind === 'rock') drawRock(ctx, n, br);
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
  const res = computePlacement(state.build, wantX, state.structures.values());
  const def = STRUCTURES[state.build];
  if (res.x === undefined) return res;
  drawStructure(ctx, { kind: state.build, x: res.x, y: res.y || GROUND_Y - def.h, lit: false }, br, t, 0.55);
  ctx.fillStyle = res.ok ? 'rgba(90,220,120,0.25)' : 'rgba(230,70,70,0.3)';
  ctx.fillRect(res.x, res.y || GROUND_Y - def.h, def.w, def.h);
  if (!res.ok && res.reason) {
    ctx.font = 'bold 13px sans-serif';
    ctx.textAlign = 'center';
    ctx.fillStyle = '#ff9d9d';
    ctx.fillText(res.reason, res.x + def.w / 2, (res.y || GROUND_Y - def.h) - 8);
  }
  return res;
}
