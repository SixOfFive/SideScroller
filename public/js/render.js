// Frame orchestration: sky -> world -> entities -> fx -> night overlay -> HUD.

import { cam, VIEW_H, updateCamera, screenToWorldX } from './camera.js';
import { state, interp, worldTime } from './state.js';
import { drawBg, dayPhase, dayBrightness } from './r_bg.js';
import { drawGround, drawNodes, drawStructures, drawBuildGhost } from './r_world.js';
import { drawPlayer, drawDino } from './r_ent.js';
import { drawFx } from './fx.js';
import { drawHud } from './hud.js';
import { ITEMS } from '/shared/items.js';
import { mouse } from './input.js';

let canvas, ctx, off, offCtx;

function toolOf(itemId) {
  const def = ITEMS[itemId];
  return def && def.tool ? def.tool : null;
}

function resize() {
  const dpr = window.devicePixelRatio || 1;
  canvas.width = Math.round(innerWidth * dpr);
  canvas.height = Math.round(innerHeight * dpr);
  canvas.style.width = innerWidth + 'px';
  canvas.style.height = innerHeight + 'px';
  cam.dpr = dpr;
}

export function initRender(c) {
  canvas = c;
  ctx = c.getContext('2d');
  resize();
  window.addEventListener('resize', resize);
}

function lightHole(x, y, r, strength = 1) {
  const g = offCtx.createRadialGradient(x, y, 0, x, y, r);
  g.addColorStop(0, `rgba(0,0,0,${strength})`);
  g.addColorStop(0.55, `rgba(0,0,0,${strength * 0.55})`);
  g.addColorStop(1, 'rgba(0,0,0,0)');
  offCtx.fillStyle = g;
  offCtx.fillRect(x - r, y - r, r * 2, r * 2);
}

// Darkness with light cut-outs around campfires and survivors.
function drawNight(br) {
  const alpha = (1 - br) * 0.86;
  if (alpha < 0.03) return;
  if (!off) {
    off = document.createElement('canvas');
    offCtx = off.getContext('2d');
  }
  const w = Math.ceil(cam.viewW), h = VIEW_H;
  if (off.width !== w || off.height !== h) { off.width = w; off.height = h; }
  offCtx.globalCompositeOperation = 'source-over';
  offCtx.clearRect(0, 0, w, h);
  offCtx.fillStyle = `rgba(7,10,28,${alpha.toFixed(3)})`;
  offCtx.fillRect(0, 0, w, h);
  offCtx.globalCompositeOperation = 'destination-out';

  for (const s of state.structures.values()) {
    if (s.kind === 'campfire' && s.lit) lightHole(s.x + 32 - cam.x, s.y + 12, 300);
    else if (s.kind === 'forge' && s.lit) lightHole(s.x + 36 - cam.x, s.y + 30, 200);
    else if (s.kind === 'portal') lightHole(s.x + 37 - cam.x, s.y + 62, 210, 0.75);
  }
  lightHole(state.me.x + 14 - cam.x, state.me.y + 24, 140, 0.85);
  for (const p of state.players.values()) {
    const pos = interp(p);
    lightHole(pos.x + 14 - cam.x, pos.y + 24, 110, 0.7);
  }
  ctx.drawImage(off, cam.x, 0, w, h); // ctx is translated by -cam.x here
}

export function render(dt) {
  const t = performance.now();
  const wt = worldTime();
  const phase = dayPhase(wt);
  const br = dayBrightness(phase);

  updateCamera(canvas);
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.save();
  ctx.scale(cam.scale, cam.scale);

  // decay + apply screen shake (from taking hits)
  const me = state.me;
  me.shake = Math.max(0, (me.shake || 0) - dt * 2.4);
  me.hurtT = Math.max(0, (me.hurtT || 0) - dt);
  if (me.shake > 0.01) {
    const s = me.shake * 9;
    ctx.translate((Math.sin(t * 0.09) * s), (Math.cos(t * 0.13) * s * 0.6));
  }

  drawBg(ctx, cam.viewW, VIEW_H, cam.x, wt);

  ctx.translate(-cam.x, 0);
  drawGround(ctx, cam.x, cam.viewW, br, t);
  drawNodes(ctx, cam.x, cam.viewW, br, t);
  drawStructures(ctx, cam.x, cam.viewW, br, t);
  if (state.build) drawBuildGhost(ctx, screenToWorldX(mouse.x), br, t);

  for (const d of state.dinos.values()) {
    const pos = interp(d);
    drawDino(ctx, pos.x, pos.y, d, br, t);
  }
  for (const p of state.players.values()) {
    const pos = interp(p);
    drawPlayer(ctx, pos.x, pos.y,
      { name: p.n, face: p.f, anim: p.a, tool: toolOf(p.e), hp: p.h, armor: p.ar || 0 }, br, t);
  }
  const myArmor = me.armor ? Object.values(me.armor).filter(Boolean).length : 0;
  drawPlayer(ctx, me.x, me.y, {
    name: state.name, face: me.face, anim: me.anim, tool: toolOf(me.equip),
    hp: me.hp, isMe: true, armor: myArmor, swingProg: 1 - me.swingT / 0.35,
  }, br, t);

  drawFx(ctx, dt, cam.x, cam.viewW);
  drawNight(br);
  ctx.restore();

  // damage flash + low-HP vignette in screen space
  const dangerA = Math.max(me.hurtT * 1.3, me.hp < 30 ? (30 - me.hp) / 90 : 0);
  if (dangerA > 0.01) {
    const g = ctx.createRadialGradient(
      canvas.width / 2, canvas.height / 2, canvas.height * 0.3,
      canvas.width / 2, canvas.height / 2, canvas.height * 0.75);
    g.addColorStop(0, 'rgba(180,20,20,0)');
    g.addColorStop(1, `rgba(180,20,20,${Math.min(0.6, dangerA).toFixed(3)})`);
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, canvas.width, canvas.height);
  }

  drawHud(ctx);
}
