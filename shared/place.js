// Pure placement logic, used by the server to validate builds and by the
// client to draw the placement ghost. `structures` is an iterable of
// {kind, x, y} objects.

import { STRUCTURES } from './structures.js';
import { GROUND_Y, GRID, MAX_WALL_STACK, WORLD_W } from './const.js';

function colOf(x) { return Math.round(x / GRID); }

function atCol(structures, col, kinds) {
  const out = [];
  for (const s of structures) {
    if (kinds.includes(s.kind) && colOf(s.x) === col) out.push(s);
  }
  return out;
}

function overlaps(structures, x, y, w, h) {
  const pad = 6; // allow near-touching placement
  for (const s of structures) {
    const d = STRUCTURES[s.kind];
    if (x + pad < s.x + d.w && x + w - pad > s.x &&
        y + pad < s.y + d.h && y + h - pad > s.y) return s;
  }
  return null;
}

// Returns {ok, x, y, reason}. x/y are the snapped top-left placement position.
export function computePlacement(kind, wantX, structures) {
  const def = STRUCTURES[kind];
  if (!def) return { ok: false, reason: 'Unknown structure' };

  if (def.grid) {
    const col = colOf(wantX - def.w / 2 + GRID / 2);
    const x = col * GRID;
    if (x < 0 || x + def.w > WORLD_W) return { ok: false, x, y: 0, reason: 'Out of bounds' };

    if (kind === 'foundation') {
      const y = GROUND_Y - def.h;
      if (atCol(structures, col, ['foundation']).length) {
        return { ok: false, x, y, reason: 'Foundation already here' };
      }
      if (overlaps(structures, x, y, def.w, def.h)) {
        return { ok: false, x, y, reason: 'Blocked' };
      }
      return { ok: true, x, y };
    }

    if (kind === 'wall' || kind === 'doorframe') {
      if (!atCol(structures, col, ['foundation']).length) {
        return { ok: false, x, y: GROUND_Y - 14 - def.h, reason: 'Needs a foundation' };
      }
      const walls = atCol(structures, col, ['wall', 'doorframe']);
      if (walls.length >= MAX_WALL_STACK) {
        return { ok: false, x, y: 0, reason: 'Max height reached' };
      }
      if (atCol(structures, col, ['roof']).length) {
        return { ok: false, x, y: 0, reason: 'Roof is in the way' };
      }
      const y = GROUND_Y - 14 - def.h * (walls.length + 1);
      return { ok: true, x, y };
    }

    if (kind === 'roof') {
      const walls = atCol(structures, col, ['wall', 'doorframe']);
      if (!walls.length) return { ok: false, x, y: 0, reason: 'Needs a wall below' };
      if (atCol(structures, col, ['roof']).length) {
        return { ok: false, x, y: 0, reason: 'Roof already here' };
      }
      const topY = Math.min(...walls.map((w) => w.y));
      return { ok: true, x, y: topY - def.h };
    }

    return { ok: false, reason: 'Unknown grid piece' };
  }

  // Free-standing pieces (campfire, storage box) sit on the ground.
  const x = Math.round(wantX - def.w / 2);
  const y = GROUND_Y - def.h;
  if (x < 0 || x + def.w > WORLD_W) return { ok: false, x, y, reason: 'Out of bounds' };
  const hit = overlaps(structures, x, y, def.w, def.h);
  if (hit) return { ok: false, x, y, reason: 'Blocked by ' + STRUCTURES[hit.kind].name };
  return { ok: true, x, y };
}
