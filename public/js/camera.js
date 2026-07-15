// Camera + coordinate transforms. The world is authored in a 720px-tall
// space (ground at y=620); we scale that to the window height and follow
// the player horizontally.

import { PLAYER_W } from '/shared/const.js';
import { EXP_END } from '/shared/regions.js';
import { state } from './state.js';

export const VIEW_H = 720;
export const cam = { x: 0, scale: 1, viewW: 1280, dpr: 1 };

export function updateCamera(canvas) {
  cam.scale = canvas.height / VIEW_H;
  cam.viewW = canvas.width / cam.scale;
  const target = state.me.x + PLAYER_W / 2 - cam.viewW / 2;
  // Camera can follow all the way into the expedition frontier, not just the
  // fixed world — otherwise a warped-in player sits off the right edge.
  const max = Math.max(0, EXP_END - cam.viewW);
  cam.x = Math.min(Math.max(target, 0), max);
}

// Mouse events give CSS px; the canvas backing store is device px.
export function screenToWorldX(sx) { return cam.x + (sx * cam.dpr) / cam.scale; }
export function screenToWorldY(sy) { return (sy * cam.dpr) / cam.scale; }
