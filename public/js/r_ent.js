// Players and dinos, drawn procedurally with simple limb animation.

import { PLAYER_W, PLAYER_H } from '/shared/const.js';
import { DINODEFS } from '/shared/dinodefs.js';
import { shade, hash01 } from './r_bg.js';

function nameHash(name) {
  let n = 0;
  for (let i = 0; i < name.length; i++) n = n * 31 + name.charCodeAt(i);
  return n >>> 0;
}

function drawTool(ctx, tool, br) {
  // Drawn in hand-space: origin at the hand, pointing up.
  ctx.strokeStyle = shade(120, 88, 52, br);
  ctx.lineWidth = 4;
  ctx.beginPath(); ctx.moveTo(0, 4); ctx.lineTo(0, -22); ctx.stroke();
  if (tool === 'axe') {
    ctx.fillStyle = shade(150, 156, 170, br);
    ctx.beginPath();
    ctx.moveTo(-1, -22); ctx.lineTo(12, -26); ctx.lineTo(12, -14); ctx.lineTo(-1, -16);
    ctx.closePath(); ctx.fill();
  } else if (tool === 'pick') {
    ctx.strokeStyle = shade(150, 156, 170, br);
    ctx.lineWidth = 4;
    ctx.beginPath(); ctx.moveTo(-10, -18); ctx.quadraticCurveTo(0, -28, 10, -18); ctx.stroke();
  } else if (tool === 'spear') {
    ctx.strokeStyle = shade(120, 88, 52, br);
    ctx.beginPath(); ctx.moveTo(0, 8); ctx.lineTo(0, -30); ctx.stroke();
    ctx.fillStyle = shade(160, 166, 180, br);
    ctx.beginPath(); ctx.moveTo(-4, -28); ctx.lineTo(0, -40); ctx.lineTo(4, -28); ctx.closePath(); ctx.fill();
  }
}

// p: {x, y} top-left; info: {name, face, anim, tool, hp, swingProg}
export function drawPlayer(ctx, x, y, info, br, t) {
  const h = nameHash(info.name || '?');
  const shirt = `hsl(${h % 360}, 45%, ${35 + br * 18}%)`;
  const skin = shade(232, 185, 138, br);
  const pants = shade(74, 74, 88, br);
  const hairC = `hsl(${(h >> 4) % 360}, 30%, ${15 + br * 15}%)`;

  const cx = x + PLAYER_W / 2;
  const walking = info.anim === 'walk';
  const phase = walking ? t * 0.013 : 0;
  const leg = Math.sin(phase) * (walking ? 0.55 : 0);
  const bob = walking ? Math.abs(Math.sin(phase)) * 2 : 0;
  const jump = info.anim === 'jump';

  ctx.save();
  ctx.translate(cx, y + PLAYER_H - bob);
  ctx.scale(info.face < 0 ? -1 : 1, 1);

  // legs
  ctx.strokeStyle = pants;
  ctx.lineWidth = 7;
  ctx.lineCap = 'round';
  const legSpread = jump ? 0.35 : leg;
  ctx.beginPath();
  ctx.moveTo(-3, -26); ctx.lineTo(-3 + Math.sin(legSpread) * 12, -2);
  ctx.moveTo(3, -26); ctx.lineTo(3 - Math.sin(legSpread) * 12, -2);
  ctx.stroke();

  // torso
  ctx.fillStyle = shirt;
  ctx.fillRect(-9, -46, 18, 22);

  // back arm
  const swingProg = info.anim === 'swing' ? (info.swingProg ?? ((t * 0.006) % 1)) : -1;
  const armSwing = swingProg >= 0
    ? -2.1 + Math.sin(Math.min(swingProg, 1) * Math.PI) * 2.6
    : (walking ? Math.sin(phase + Math.PI) * 0.5 : 0.15);
  ctx.strokeStyle = shade(200, 158, 118, br);
  ctx.lineWidth = 6;
  ctx.beginPath();
  ctx.moveTo(-6, -43);
  ctx.lineTo(-6 + Math.sin(walking ? phase : 0.3) * 10, -26);
  ctx.stroke();

  // head
  ctx.fillStyle = skin;
  ctx.beginPath(); ctx.arc(0, -55, 9.5, 0, 7); ctx.fill();
  ctx.fillStyle = hairC;
  ctx.beginPath(); ctx.arc(0, -58, 9.5, Math.PI, Math.PI * 2); ctx.fill();
  ctx.fillStyle = '#222';
  ctx.fillRect(4, -57, 2.4, 2.4);

  // front arm + tool
  ctx.save();
  ctx.translate(5, -43);
  ctx.rotate(armSwing);
  ctx.strokeStyle = skin;
  ctx.lineWidth = 6;
  ctx.beginPath(); ctx.moveTo(0, 0); ctx.lineTo(4, 16); ctx.stroke();
  ctx.translate(4, 16);
  if (info.tool && info.tool !== 'hand') drawTool(ctx, info.tool, br);
  ctx.restore();

  ctx.restore();

  // name + hp
  ctx.font = '600 12px sans-serif';
  ctx.textAlign = 'center';
  ctx.fillStyle = 'rgba(0,0,0,0.5)';
  ctx.fillText(info.name, cx + 1, y - 13);
  ctx.fillStyle = info.isMe ? '#ffd76e' : '#fff';
  ctx.fillText(info.name, cx, y - 14);
  if (info.hp !== undefined && info.hp < 100) {
    ctx.fillStyle = 'rgba(0,0,0,0.55)';
    ctx.fillRect(cx - 20, y - 10, 40, 5);
    ctx.fillStyle = info.hp > 30 ? '#7ec96a' : '#e05a4e';
    ctx.fillRect(cx - 20, y - 10, 40 * (info.hp / 100), 5);
  }
}

// d: dino wire {i, x, y, f, s, tm, o, h, nm, sp} at interpolated pos
export function drawDino(ctx, x, y, d, br, t) {
  const def = DINODEFS[d.sp || 'dodo'];
  const h = typeof d.i === 'string' ? nameHash(d.i) : d.i;
  const hue = 25 + hash01(h) * 30;
  const light = 32 + hash01(h * 3) * 14;
  const body = `hsl(${hue}, 32%, ${light * (0.4 + br * 0.6)}%)`;
  const belly = `hsl(${hue}, 30%, ${(light + 14) * (0.4 + br * 0.6)}%)`;

  const cx = x + def.w / 2;
  const base = y + def.h;
  const moving = d.s === 'walk' || d.s === 'flee' || d.s === 'follow';
  const waddle = moving ? Math.sin(t * (d.s === 'flee' ? 0.03 : 0.015) + h) : 0;

  ctx.save();
  ctx.translate(cx, base + Math.abs(waddle) * -2);
  ctx.scale(d.f < 0 ? -1 : 1, 1);

  // legs
  ctx.strokeStyle = shade(214, 160, 66, br);
  ctx.lineWidth = 4;
  ctx.lineCap = 'round';
  ctx.beginPath();
  ctx.moveTo(-8, -14); ctx.lineTo(-8 + waddle * 6, 0);
  ctx.moveTo(8, -14); ctx.lineTo(8 - waddle * 6, 0);
  ctx.stroke();

  // body + belly + tail puff
  ctx.fillStyle = body;
  ctx.beginPath(); ctx.ellipse(0, -26, 24, 17, 0, 0, 7); ctx.fill();
  ctx.fillStyle = belly;
  ctx.beginPath(); ctx.ellipse(-2, -22, 15, 10, 0, 0, 7); ctx.fill();
  ctx.fillStyle = body;
  ctx.beginPath();
  ctx.arc(-22, -32, 6, 0, 7);
  ctx.arc(-26, -27, 5, 0, 7);
  ctx.fill();

  // wing
  ctx.fillStyle = `hsl(${hue}, 30%, ${(light - 8) * (0.4 + br * 0.6)}%)`;
  ctx.beginPath(); ctx.ellipse(-4, -27, 10, 6, -0.3, 0, 7); ctx.fill();

  // neck + head
  ctx.fillStyle = body;
  ctx.beginPath(); ctx.ellipse(16, -40, 8, 10, 0.2, 0, 7); ctx.fill();
  ctx.beginPath(); ctx.arc(20, -48, 9, 0, 7); ctx.fill();
  // beak
  ctx.fillStyle = shade(235, 172, 70, br);
  ctx.beginPath();
  ctx.moveTo(26, -52); ctx.lineTo(42, -47); ctx.lineTo(26, -43);
  ctx.closePath(); ctx.fill();
  // eye
  ctx.fillStyle = '#1b1b1b';
  ctx.beginPath(); ctx.arc(21, -50, 2.2, 0, 7); ctx.fill();

  ctx.restore();

  // labels: taming progress or owner tag
  if (d.o) {
    ctx.font = '600 11px sans-serif';
    ctx.textAlign = 'center';
    ctx.fillStyle = '#9be09b';
    ctx.fillText(`${d.nm || def.name} (${d.o})${d.s === 'stay' ? ' ⏸' : ''}`, cx, y - 8);
  } else if (d.tm > 0) {
    const w = 46;
    ctx.fillStyle = 'rgba(0,0,0,0.55)';
    ctx.fillRect(cx - w / 2 - 1, y - 13, w + 2, 7);
    ctx.fillStyle = '#c77dd8';
    ctx.fillRect(cx - w / 2, y - 12, w * Math.min(1, d.tm), 5);
    ctx.font = '10px sans-serif';
    ctx.fillStyle = '#e8c6f0';
    ctx.textAlign = 'center';
    ctx.fillText('taming…', cx, y - 17);
  }
  if (d.h !== undefined && d.h < def.hp && !d.o) {
    ctx.fillStyle = 'rgba(0,0,0,0.55)';
    ctx.fillRect(cx - 20, y - 4, 40, 4);
    ctx.fillStyle = '#e05a4e';
    ctx.fillRect(cx - 20, y - 4, 40 * (d.h / def.hp), 4);
  }
}
