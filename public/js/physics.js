// Local-player platformer physics: flat ground, solid walls, one-way
// platforms (foundations, roofs, wall tops). Runs client-side; the server
// trusts positions within bounds (co-op game, tribe honor system).

import {
  GRAVITY, MOVE_SPEED, JUMP_VEL, PLAYER_W, PLAYER_H, GROUND_Y,
} from '/shared/const.js';
import { STRUCTURES } from '/shared/structures.js';
import { state } from './state.js';

const MAX_FALL = 1400;

function colliders() {
  const solids = [], platforms = [];
  for (const s of state.structures.values()) {
    const def = STRUCTURES[s.kind];
    const rect = { x: s.x, y: s.y, w: def.w, h: def.h };
    if (def.solid) { solids.push(rect); platforms.push(rect); }
    else if (def.platform) platforms.push(rect);
  }
  return { solids, platforms };
}

export function stepLocal(me, dt, held) {
  const { solids, platforms } = colliders();

  const dir = (held.right ? 1 : 0) - (held.left ? 1 : 0);
  me.vx = dir * MOVE_SPEED;
  if (dir !== 0) me.face = dir;

  if (held.jump && me.grounded) {
    me.vy = -JUMP_VEL;
    me.grounded = false;
  }
  me.vy = Math.min(me.vy + GRAVITY * dt, MAX_FALL);

  // Horizontal sweep against solids.
  let nx = me.x + me.vx * dt;
  for (const r of solids) {
    if (me.y + PLAYER_H <= r.y || me.y >= r.y + r.h) continue;
    if (me.vx > 0 && me.x + PLAYER_W <= r.x && nx + PLAYER_W > r.x) { nx = r.x - PLAYER_W; me.vx = 0; }
    if (me.vx < 0 && me.x >= r.x + r.w && nx < r.x + r.w) { nx = r.x + r.w; me.vx = 0; }
  }
  me.x = Math.min(Math.max(nx, 0), state.worldW - PLAYER_W);

  // Vertical: land on ground or one-way platform tops when falling.
  let ny = me.y + me.vy * dt;
  me.grounded = false;
  if (me.vy < 0) { // head-bonk on the underside of solid walls only
    for (const r of solids) {
      if (me.x + PLAYER_W <= r.x + 4 || me.x >= r.x + r.w - 4) continue;
      if (me.y >= r.y + r.h - 2 && ny < r.y + r.h) { ny = r.y + r.h; me.vy = 0; }
    }
  }
  if (me.vy >= 0) {
    const prevBottom = me.y + PLAYER_H;
    let landY = GROUND_Y;
    for (const r of platforms) {
      if (me.x + PLAYER_W <= r.x + 4 || me.x >= r.x + r.w - 4) continue;
      if (prevBottom <= r.y + 2 && ny + PLAYER_H >= r.y) landY = Math.min(landY, r.y);
    }
    if (ny + PLAYER_H >= landY) {
      ny = landY - PLAYER_H;
      me.vy = 0;
      me.grounded = true;
    }
  }
  me.y = ny;

  if (me.swingT > 0) me.swingT = Math.max(0, me.swingT - dt);
  me.anim = me.swingT > 0 ? 'swing'
    : !me.grounded ? 'jump'
    : Math.abs(me.vx) > 10 ? 'walk' : 'idle';
}
