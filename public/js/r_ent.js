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
  // Drawn in hand-space: origin at the hand, pointing up. Metal variants share
  // the stone shapes with a brighter head.
  const metal = tool === 'metal_axe' || tool === 'metal_pick';
  const head = metal ? shade(200, 206, 222, br) : shade(150, 156, 170, br);
  const base = tool === 'metal_axe' ? 'axe' : tool === 'metal_pick' ? 'pick' : tool;
  ctx.strokeStyle = shade(120, 88, 52, br);
  ctx.lineWidth = 4;
  if (base !== 'gun') { ctx.beginPath(); ctx.moveTo(0, 4); ctx.lineTo(0, -22); ctx.stroke(); }
  if (base === 'axe') {
    ctx.fillStyle = head;
    ctx.beginPath();
    ctx.moveTo(-1, -22); ctx.lineTo(12, -26); ctx.lineTo(12, -14); ctx.lineTo(-1, -16);
    ctx.closePath(); ctx.fill();
  } else if (base === 'pick') {
    ctx.strokeStyle = head;
    ctx.lineWidth = 4;
    ctx.beginPath(); ctx.moveTo(-10, -18); ctx.quadraticCurveTo(0, -28, 10, -18); ctx.stroke();
  } else if (base === 'spear') {
    ctx.strokeStyle = shade(120, 88, 52, br);
    ctx.beginPath(); ctx.moveTo(0, 8); ctx.lineTo(0, -30); ctx.stroke();
    ctx.fillStyle = shade(160, 166, 180, br);
    ctx.beginPath(); ctx.moveTo(-4, -28); ctx.lineTo(0, -40); ctx.lineTo(4, -28); ctx.closePath(); ctx.fill();
  } else if (base === 'sword') {
    ctx.strokeStyle = shade(90, 66, 44, br); ctx.lineWidth = 5;
    ctx.beginPath(); ctx.moveTo(-6, 2); ctx.lineTo(6, 2); ctx.stroke(); // guard
    ctx.strokeStyle = shade(206, 212, 228, br); ctx.lineWidth = 4;
    ctx.beginPath(); ctx.moveTo(0, 2); ctx.lineTo(0, -34); ctx.stroke();
    ctx.fillStyle = shade(230, 234, 246, br);
    ctx.beginPath(); ctx.moveTo(-2, -34); ctx.lineTo(0, -40); ctx.lineTo(2, -34); ctx.closePath(); ctx.fill();
  } else if (base === 'gun') {
    // rifle held roughly horizontal
    ctx.fillStyle = shade(60, 62, 70, br);
    ctx.fillRect(-2, -6, 34, 5);
    ctx.fillStyle = shade(96, 66, 40, br);
    ctx.fillRect(-6, -6, 10, 12);
    ctx.strokeStyle = shade(60, 62, 70, br); ctx.lineWidth = 3;
    ctx.beginPath(); ctx.moveTo(4, 2); ctx.lineTo(0, 10); ctx.stroke(); // trigger guard
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

  const armor = info.armor || 0;

  // legs
  ctx.strokeStyle = armor >= 3 ? shade(150, 158, 176, br) : pants;
  ctx.lineWidth = armor >= 3 ? 8 : 7;
  ctx.lineCap = 'round';
  const legSpread = jump ? 0.35 : leg;
  ctx.beginPath();
  ctx.moveTo(-3, -26); ctx.lineTo(-3 + Math.sin(legSpread) * 12, -2);
  ctx.moveTo(3, -26); ctx.lineTo(3 - Math.sin(legSpread) * 12, -2);
  ctx.stroke();

  // torso (metal chestplate when body armor is worn)
  ctx.fillStyle = armor >= 2 ? shade(156, 164, 182, br) : shirt;
  ctx.fillRect(-9, -46, 18, 22);
  if (armor >= 2) {
    ctx.strokeStyle = shade(112, 120, 140, br); ctx.lineWidth = 1.5;
    ctx.strokeRect(-8, -45, 16, 20);
    ctx.beginPath(); ctx.moveTo(0, -45); ctx.lineTo(0, -25); ctx.stroke();
  }

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
  if (armor >= 1) {
    // metal helmet dome + brim
    ctx.fillStyle = shade(176, 182, 200, br);
    ctx.beginPath(); ctx.arc(0, -56, 10.5, Math.PI, Math.PI * 2); ctx.fill();
    ctx.fillRect(-10.5, -56, 21, 3.5);
    ctx.fillStyle = '#222';
    ctx.fillRect(4, -56, 3, 2.2);
  } else {
    ctx.fillStyle = hairC;
    ctx.beginPath(); ctx.arc(0, -58, 9.5, Math.PI, Math.PI * 2); ctx.fill();
    ctx.fillStyle = '#222';
    ctx.fillRect(4, -57, 2.4, 2.4);
  }

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

// Per-species visual params. hue drives body color; the rest tweak silhouette.
const LOOK = {
  compy:    { hue: 96,  sat: 40, jaw: 0.6, crest: 0, frill: 0, tail: 1.15, arm: 0.5, teeth: 0 },
  dilo:     { hue: 38,  sat: 46, jaw: 0.85, crest: 0.7, frill: 1, tail: 1.0, arm: 0.6, teeth: 1 },
  parasaur: { hue: 150, sat: 34, jaw: 0.5, crest: 1.6, frill: 0, tail: 1.25, arm: 0.4, teeth: 0 },
  raptor:   { hue: 184, sat: 40, jaw: 0.95, crest: 0, frill: 0, tail: 1.2, arm: 0.7, teeth: 1, claw: 1 },
  rex:      { hue: 20,  sat: 42, jaw: 1.5, crest: 0, frill: 0, tail: 1.0, arm: 0.25, teeth: 1 },
  carno:    { hue: 10,  sat: 46, jaw: 1.2, crest: 0, frill: 0, tail: 1.05, arm: 0.2, teeth: 1, claw: 1 },
  troodon:  { hue: 128, sat: 46, jaw: 0.8, crest: 0, frill: 0, tail: 1.28, arm: 0.6, teeth: 1, claw: 1 },
};

// Per-species quadruped params (trike/sarco/sabertooth): body color + head kit.
const QLOOK = {
  trike:      { hue: 110, sat: 28, tail: 0.7, neck: 0.5, head: 0.95, snout: 0.5, frill: 1, horns: 1, fang: 0, low: 0 },
  sarco:      { hue: 74,  sat: 26, tail: 1.35, neck: 0.7, head: 1.05, snout: 1.5, frill: 0, horns: 0, fang: 1, low: 1 },
  sabertooth: { hue: 30,  sat: 42, tail: 0.7, neck: 0.5, head: 0.92, snout: 0.7, frill: 0, horns: 0, fang: 2, low: 0.4 },
};

// A generic theropod filling the [0,-H]x[±W/2] box, facing +x, feet at y=0.
function drawTheropod(ctx, d, def, look, h, br, t) {
  const W = def.w, H = def.h;
  const indiv = (hash01(h) - 0.5) * 10;
  const L = (l) => Math.max(0, Math.min(100, l * (0.42 + br * 0.58)));
  const body = `hsl(${look.hue + indiv}, ${look.sat}%, ${L(38)}%)`;
  const dark = `hsl(${look.hue + indiv}, ${look.sat}%, ${L(28)}%)`;
  const belly = `hsl(${look.hue + indiv}, ${look.sat - 6}%, ${L(52)}%)`;
  const moving = d.s === 'walk' || d.s === 'flee' || d.s === 'follow' || d.s === 'chase' || d.s === 'ridden';
  const spd = d.s === 'flee' || d.s === 'chase' ? 0.03 : 0.016;
  const gait = moving ? Math.sin(t * spd + h) : 0;
  const hipY = -H * 0.44;

  // tail
  ctx.fillStyle = dark;
  ctx.beginPath();
  ctx.moveTo(-W * 0.1, hipY);
  ctx.quadraticCurveTo(-W * 0.5 * look.tail, hipY + H * 0.05, -W * 0.62 * look.tail, -H * 0.05);
  ctx.quadraticCurveTo(-W * 0.42, hipY + H * 0.16, -W * 0.05, hipY + H * 0.06);
  ctx.closePath(); ctx.fill();

  // far leg (behind)
  ctx.strokeStyle = dark;
  ctx.lineWidth = Math.max(4, H * 0.09);
  ctx.lineCap = 'round';
  ctx.beginPath();
  ctx.moveTo(W * 0.02, hipY);
  ctx.lineTo(W * 0.02 - gait * W * 0.12, -2);
  ctx.stroke();

  // body
  ctx.fillStyle = body;
  ctx.beginPath();
  ctx.ellipse(-W * 0.02, hipY - H * 0.02, W * 0.34, H * 0.26, -0.15, 0, 7);
  ctx.fill();
  ctx.fillStyle = belly;
  ctx.beginPath();
  ctx.ellipse(W * 0.04, hipY + H * 0.05, W * 0.22, H * 0.15, -0.15, 0, 7);
  ctx.fill();

  // near leg (front, animated) with clawed foot
  ctx.strokeStyle = body;
  ctx.lineWidth = Math.max(4, H * 0.1);
  ctx.beginPath();
  const footX = W * 0.06 + gait * W * 0.12;
  ctx.moveTo(W * 0.06, hipY);
  ctx.lineTo(footX, -2);
  ctx.stroke();
  if (look.claw) {
    ctx.strokeStyle = '#e9e4d0'; ctx.lineWidth = 2;
    ctx.beginPath(); ctx.moveTo(footX, -2); ctx.lineTo(footX + W * 0.05, -H * 0.09); ctx.stroke();
  }

  // little arm
  if (look.arm) {
    ctx.strokeStyle = dark;
    ctx.lineWidth = Math.max(2.5, H * 0.05);
    ctx.beginPath();
    ctx.moveTo(W * 0.16, hipY - H * 0.05);
    ctx.lineTo(W * 0.22, hipY + H * 0.06 * look.arm + gait * 3);
    ctx.stroke();
  }

  // neck + head
  const headX = W * 0.3, headY = hipY - H * 0.34;
  ctx.strokeStyle = body;
  ctx.lineWidth = H * 0.18;
  ctx.beginPath();
  ctx.moveTo(W * 0.12, hipY - H * 0.12);
  ctx.quadraticCurveTo(W * 0.26, hipY - H * 0.3, headX, headY);
  ctx.stroke();

  // frill (dilo)
  if (look.frill) {
    ctx.fillStyle = `hsl(${(look.hue + 180) % 360}, 55%, ${L(50)}%)`;
    ctx.beginPath();
    ctx.ellipse(headX - W * 0.03, headY, W * 0.11, H * 0.16, 0, 0, 7);
    ctx.fill();
  }
  // head
  ctx.fillStyle = body;
  ctx.beginPath();
  ctx.ellipse(headX, headY, W * 0.12, H * 0.12, 0.15, 0, 7);
  ctx.fill();
  // crest (parasaur/dilo)
  if (look.crest) {
    ctx.fillStyle = dark;
    ctx.beginPath();
    ctx.moveTo(headX - W * 0.02, headY - H * 0.08);
    ctx.lineTo(headX - W * 0.16 * look.crest, headY - H * 0.24 * look.crest);
    ctx.lineTo(headX + W * 0.04, headY - H * 0.05);
    ctx.closePath(); ctx.fill();
  }
  // jaw / snout
  const jw = W * 0.14 * look.jaw, jh = H * 0.07 * look.jaw;
  ctx.fillStyle = body;
  ctx.beginPath();
  ctx.moveTo(headX + W * 0.06, headY - jh);
  ctx.lineTo(headX + W * 0.06 + jw, headY - jh * 0.3);
  ctx.lineTo(headX + W * 0.06 + jw, headY + jh);
  ctx.lineTo(headX + W * 0.06, headY + jh * 0.8);
  ctx.closePath(); ctx.fill();
  if (look.teeth) {
    ctx.fillStyle = '#f2eede';
    for (let i = 0; i < 3; i++) {
      const tx = headX + W * 0.08 + (jw * (i + 0.5)) / 3;
      ctx.beginPath();
      ctx.moveTo(tx, headY + jh * 0.9);
      ctx.lineTo(tx + 2, headY + jh * 0.9);
      ctx.lineTo(tx + 1, headY + jh * 0.9 + jh * 0.5);
      ctx.closePath(); ctx.fill();
    }
  }
  // eye
  ctx.fillStyle = d.o ? '#1b1b1b' : (def.behavior === 'aggressive' ? '#e33' : '#1b1b1b');
  ctx.beginPath(); ctx.arc(headX + W * 0.02, headY - H * 0.02, Math.max(2, H * 0.03), 0, 7); ctx.fill();
}

function drawLeg(ctx, x, hipY, phase) {
  ctx.beginPath();
  ctx.moveTo(x, hipY);
  ctx.lineTo(x + phase * 10, -2);
  ctx.stroke();
}

// A generic four-legged beast filling [0,-H]x[±W/2], facing +x, feet at y=0.
// Head kit (frill/horns/snout/fangs) is driven by the QLOOK entry.
function drawQuadruped(ctx, d, def, look, h, br, t) {
  const W = def.w, H = def.h;
  const indiv = (hash01(h) - 0.5) * 8;
  const L = (l) => Math.max(0, Math.min(100, l * (0.42 + br * 0.58)));
  const body = `hsl(${look.hue + indiv}, ${look.sat}%, ${L(40)}%)`;
  const dark = `hsl(${look.hue + indiv}, ${look.sat}%, ${L(29)}%)`;
  const belly = `hsl(${look.hue + indiv}, ${look.sat - 6}%, ${L(54)}%)`;
  const moving = d.s === 'walk' || d.s === 'flee' || d.s === 'follow' || d.s === 'chase' || d.s === 'ridden';
  const spd = d.s === 'flee' || d.s === 'chase' ? 0.03 : 0.016;
  const gait = moving ? Math.sin(t * spd + h) : 0;
  const backY = -H * (look.low ? 0.50 : 0.62);
  const hipY = -H * 0.30;

  // tail
  ctx.fillStyle = dark;
  ctx.beginPath();
  ctx.moveTo(-W * 0.18, backY + H * 0.16);
  ctx.quadraticCurveTo(-W * 0.55 * look.tail, hipY - H * 0.02, -W * 0.66 * look.tail, hipY + H * 0.10);
  ctx.quadraticCurveTo(-W * 0.40, hipY + H * 0.18, -W * 0.12, hipY + H * 0.04);
  ctx.closePath(); ctx.fill();

  // far legs
  ctx.strokeStyle = dark; ctx.lineWidth = Math.max(4, H * 0.10); ctx.lineCap = 'round';
  drawLeg(ctx, -W * 0.12, hipY, -gait);
  drawLeg(ctx, W * 0.20, hipY, gait);

  // body + belly
  ctx.fillStyle = body;
  ctx.beginPath();
  ctx.ellipse(0, (backY + hipY) / 2, W * 0.40, (hipY - backY) / 2 + H * 0.04, 0, 0, 7);
  ctx.fill();
  ctx.fillStyle = belly;
  ctx.beginPath();
  ctx.ellipse(0, hipY + H * 0.02, W * 0.32, H * 0.10, 0, 0, 7);
  ctx.fill();

  // near legs (animated opposite)
  ctx.strokeStyle = body; ctx.lineWidth = Math.max(4, H * 0.11);
  drawLeg(ctx, -W * 0.06, hipY, gait);
  drawLeg(ctx, W * 0.26, hipY, -gait);

  // neck + head
  const headX = W * 0.42, headY = backY - H * 0.06 - look.neck * H * 0.16;
  ctx.strokeStyle = body; ctx.lineWidth = H * 0.20;
  ctx.beginPath();
  ctx.moveTo(W * 0.24, backY + H * 0.04);
  ctx.quadraticCurveTo(W * 0.36, backY - H * 0.02, headX, headY);
  ctx.stroke();

  // frill (trike) behind the head
  if (look.frill) {
    ctx.fillStyle = `hsl(${look.hue + indiv}, ${look.sat + 10}%, ${L(46)}%)`;
    ctx.beginPath();
    ctx.ellipse(headX - W * 0.06, headY, W * 0.12, H * 0.28, 0, 0, 7);
    ctx.fill();
    ctx.strokeStyle = dark; ctx.lineWidth = 2; ctx.stroke();
  }
  // head
  ctx.fillStyle = body;
  ctx.beginPath();
  ctx.ellipse(headX, headY, W * 0.12 * look.head, H * 0.13 * look.head, 0.1, 0, 7);
  ctx.fill();

  // snout / jaws
  const sn = W * 0.14 * look.snout;
  ctx.fillStyle = body;
  ctx.beginPath();
  ctx.moveTo(headX + W * 0.05, headY - H * 0.05);
  ctx.lineTo(headX + W * 0.05 + sn, headY - H * 0.02);
  ctx.lineTo(headX + W * 0.05 + sn, headY + H * 0.05);
  ctx.lineTo(headX + W * 0.05, headY + H * 0.06);
  ctx.closePath(); ctx.fill();
  if (look.fang >= 2) { // sabertooth fang
    ctx.fillStyle = '#f2eede';
    const fx = headX + W * 0.05 + sn * 0.5;
    ctx.beginPath();
    ctx.moveTo(fx, headY + H * 0.05); ctx.lineTo(fx + 2, headY + H * 0.05);
    ctx.lineTo(fx + 1, headY + H * 0.20); ctx.closePath(); ctx.fill();
  } else if (look.fang) { // croc tooth row
    ctx.fillStyle = '#f2eede';
    for (let i = 0; i < 3; i++) {
      const tx = headX + W * 0.06 + (sn * (i + 0.5)) / 3;
      ctx.beginPath();
      ctx.moveTo(tx, headY + H * 0.045); ctx.lineTo(tx + 1.5, headY + H * 0.045);
      ctx.lineTo(tx + 0.75, headY + H * 0.10); ctx.closePath(); ctx.fill();
    }
  }
  // horns (trike)
  if (look.horns) {
    ctx.strokeStyle = '#e9e4d0'; ctx.lineWidth = Math.max(2.5, H * 0.045); ctx.lineCap = 'round';
    ctx.beginPath(); ctx.moveTo(headX + W * 0.13, headY - H * 0.05); ctx.lineTo(headX + W * 0.26, headY - H * 0.22); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(headX + W * 0.15, headY + H * 0.03); ctx.lineTo(headX + W * 0.24, headY - H * 0.03); ctx.stroke();
  }
  // eye
  ctx.fillStyle = d.o ? '#1b1b1b' : (def.behavior === 'aggressive' ? '#e33' : '#1b1b1b');
  ctx.beginPath(); ctx.arc(headX + W * 0.02, headY - H * 0.02, Math.max(2, H * 0.032), 0, 7); ctx.fill();
}

// Dodo keeps its round-bird look; everything else is a theropod.
function drawDodo(ctx, d, def, h, br, t) {
  const hue = 25 + hash01(h) * 30;
  const light = 32 + hash01(h * 3) * 14;
  const body = `hsl(${hue}, 32%, ${light * (0.4 + br * 0.6)}%)`;
  const belly = `hsl(${hue}, 30%, ${(light + 14) * (0.4 + br * 0.6)}%)`;
  const moving = d.s === 'walk' || d.s === 'flee' || d.s === 'follow';
  const waddle = moving ? Math.sin(t * (d.s === 'flee' ? 0.03 : 0.015) + h) : 0;

  ctx.strokeStyle = shade(214, 160, 66, br);
  ctx.lineWidth = 4; ctx.lineCap = 'round';
  ctx.beginPath();
  ctx.moveTo(-8, -14); ctx.lineTo(-8 + waddle * 6, 0);
  ctx.moveTo(8, -14); ctx.lineTo(8 - waddle * 6, 0);
  ctx.stroke();
  ctx.fillStyle = body;
  ctx.beginPath(); ctx.ellipse(0, -26, 24, 17, 0, 0, 7); ctx.fill();
  ctx.fillStyle = belly;
  ctx.beginPath(); ctx.ellipse(-2, -22, 15, 10, 0, 0, 7); ctx.fill();
  ctx.fillStyle = body;
  ctx.beginPath(); ctx.arc(-22, -32, 6, 0, 7); ctx.arc(-26, -27, 5, 0, 7); ctx.fill();
  ctx.fillStyle = `hsl(${hue}, 30%, ${(light - 8) * (0.4 + br * 0.6)}%)`;
  ctx.beginPath(); ctx.ellipse(-4, -27, 10, 6, -0.3, 0, 7); ctx.fill();
  ctx.fillStyle = body;
  ctx.beginPath(); ctx.ellipse(16, -40, 8, 10, 0.2, 0, 7); ctx.fill();
  ctx.beginPath(); ctx.arc(20, -48, 9, 0, 7); ctx.fill();
  ctx.fillStyle = shade(235, 172, 70, br);
  ctx.beginPath(); ctx.moveTo(26, -52); ctx.lineTo(42, -47); ctx.lineTo(26, -43); ctx.closePath(); ctx.fill();
  ctx.fillStyle = '#1b1b1b';
  ctx.beginPath(); ctx.arc(21, -50, 2.2, 0, 7); ctx.fill();
}

// d: dino wire {i, x, y, f, s, tm, o, h, nm, sp, r} at interpolated pos
export function drawDino(ctx, x, y, d, br, t) {
  const def = DINODEFS[d.sp || 'dodo'];
  const h = typeof d.i === 'string' ? nameHash(d.i) : d.i;
  const cx = x + def.w / 2;
  const base = y + def.h;

  ctx.save();
  ctx.translate(cx, base);
  ctx.scale(d.f < 0 ? -1 : 1, 1);
  if (d.kd) ctx.globalAlpha = 0.7; // knocked out: washed out
  if (d.sp === 'dodo' || !d.sp) drawDodo(ctx, d, def, h, br, t);
  else if (def.shape === 'quadruped') drawQuadruped(ctx, d, def, QLOOK[d.sp] || QLOOK.sarco, h, br, t);
  else drawTheropod(ctx, d, def, LOOK[d.sp] || LOOK.compy, h, br, t);
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
  if (!d.o) {
    if (d.kd) {
      // knocked out and ready to train: tell the player what to feed it
      const food = def.tame && def.tame.food === 'berry' ? 'berries' : 'meat';
      ctx.font = '700 11px sans-serif';
      ctx.textAlign = 'center';
      ctx.fillStyle = 'rgba(0,0,0,0.55)';
      ctx.fillText(`${def.name} KO — feed ${food}`, cx + 1, y - 7);
      ctx.fillStyle = '#ffe08a';
      ctx.fillText(`${def.name} KO — feed ${food}`, cx, y - 8);
    } else {
      // threat-colored name for wild dinos so a rex reads differently than a compy
      const THREAT = ['#a7d8a0', '#e6d27a', '#e8a24e', '#e8663e', '#ff3b3b', '#ff3b3b'];
      if ((def.threat || 0) >= 1) {
        ctx.font = `${def.threat >= 3 ? '700' : '600'} 11px sans-serif`;
        ctx.textAlign = 'center';
        ctx.fillStyle = 'rgba(0,0,0,0.5)';
        ctx.fillText(def.name, cx + 1, y - 7);
        ctx.fillStyle = THREAT[def.threat] || '#fff';
        ctx.fillText(def.threat >= 4 ? `⚠ ${def.name} ⚠` : def.name, cx, y - 8);
      }
      if (d.h !== undefined && d.h < def.hp) {
        ctx.fillStyle = 'rgba(0,0,0,0.55)';
        ctx.fillRect(cx - 22, y - 4, 44, 4);
        ctx.fillStyle = '#e05a4e';
        ctx.fillRect(cx - 22, y - 4, 44 * (d.h / def.hp), 4);
      }
    }
  }
}
