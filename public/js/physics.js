// Local-player platformer physics: flat ground, solid walls, one-way
// platforms (foundations, roofs, wall tops). Runs client-side; the server
// trusts positions within bounds (co-op game, tribe honor system).

import {
  GRAVITY, MOVE_SPEED, JUMP_VEL, PLAYER_W, PLAYER_H,
} from '/shared/const.js';
import { clampMove } from '/shared/regions.js';
import { STRUCTURES } from '/shared/structures.js';
import { groundTop, inWater } from '/shared/terrain.js';
import { state } from './state.js';

const MAX_FALL = 1400;
const WATER_SLOW = 0.55;   // wading through a stream

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
  const wasGrounded = me.grounded; // for downhill snap-down

  const wading = inWater(me.x + PLAYER_W / 2, me.y + PLAYER_H);
  const speed = MOVE_SPEED * (me.speedMul || 1) * (wading ? WATER_SLOW : 1);

  const dir = (held.right ? 1 : 0) - (held.left ? 1 : 0);
  me.vx = dir * speed;
  if (dir !== 0) me.face = dir;

  if (held.jump && me.grounded) {
    me.vy = -JUMP_VEL;
    me.grounded = false;
  }
  me.vy = Math.min(me.vy + GRAVITY * dt, MAX_FALL);
  me.inWater = wading;

  // Horizontal sweep against solids.
  let nx = me.x + me.vx * dt;
  for (const r of solids) {
    if (me.y + PLAYER_H <= r.y || me.y >= r.y + r.h) continue;
    if (me.vx > 0 && me.x + PLAYER_W <= r.x && nx + PLAYER_W > r.x) { nx = r.x - PLAYER_W; me.vx = 0; }
    if (me.vx < 0 && me.x >= r.x + r.w && nx < r.x + r.w) { nx = r.x + r.w; me.vx = 0; }
  }
  // Domain-aware: mainland stays on the mainland (and out of the strait), an
  // expedition player stays inside their zone. Matches the server clamp.
  me.x = clampMove(nx, PLAYER_W, me.x);

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
    // Terrain is a solid floor; structure platforms are one-way from above.
    let landY = groundTop(me.x, PLAYER_W);
    for (const r of platforms) {
      if (me.x + PLAYER_W <= r.x + 4 || me.x >= r.x + r.w - 4) continue;
      if (prevBottom <= r.y + 2 && ny + PLAYER_H >= r.y) landY = Math.min(landY, r.y);
    }
    // Snap down onto ground that dropped away this frame (walking downhill), so
    // `grounded` doesn't flicker off and eat jump inputs. Fresh jumps have
    // vy < 0 and skip this whole block.
    const snap = wasGrounded ? Math.abs(me.vx) * dt * 2 + 3 : 0;
    if (ny + PLAYER_H >= landY - snap) {
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
