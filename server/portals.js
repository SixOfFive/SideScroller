// Portal network: a safe meadow hub with one portal out to each region past
// the meadow, plus a return portal at each region entrance. Portals are world
// fixtures (server-placed, never saved) so they rebuild deterministically at
// every boot and never collide with player builds.

import { world } from './state.js';
import { REGIONS, regionEntranceX } from '../shared/regions.js';
import { SPAWN_X } from '../shared/const.js';
import { groundAt, streamAt, STREAM_HALF } from '../shared/terrain.js';
import { STRUCTURES } from '../shared/structures.js';

const HUB0 = 1120, HUB_SPACING = 250;
const HUB_HUE = 205;                       // return portals glow blue
const DANGER_HUE = [140, 96, 56, 28, 4];   // outbound portals: green -> red

// Nudge an x clear of any stream basin so portals never sit in (or land you in)
// water. Deterministic since streamAt is seed-derived.
function dryX(x) {
  const s = streamAt(x);
  return s ? Math.round(s.c + Math.sign(s.d || 1) * (STREAM_HALF + 60)) : x;
}

function makePortal(id, x, dest, label, hue) {
  const def = STRUCTURES.portal;
  return {
    id, kind: 'portal',
    x: Math.round(x - def.w / 2),
    y: Math.round(groundAt(x) - def.h),
    dest: Math.round(dest), label, hue, owner: null,
  };
}

export function setupPortals() {
  for (const [id, s] of world.structures) if (s.kind === 'portal') world.structures.delete(id);

  for (let idx = 1; idx < REGIONS.length; idx++) {
    const region = REGIONS[idx];
    const hubX = HUB0 + (idx - 1) * HUB_SPACING;
    const entrance = dryX(regionEntranceX(idx)); // return portal on dry ground
    // outbound: hub -> region (land a little before the return portal, dry)
    const out = makePortal(`pt_h${idx}`, hubX, dryX(entrance - 150), region.name, DANGER_HUE[idx] ?? 0);
    // return: region entrance -> hub
    const back = makePortal(`pt_r${idx}`, entrance, SPAWN_X - 40, 'Hub', HUB_HUE);
    world.structures.set(out.id, out);
    world.structures.set(back.id, back);
  }
  console.log(`portals: ${(REGIONS.length - 1) * 2} placed (hub + returns)`);
}
