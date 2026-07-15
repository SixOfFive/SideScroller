// Portal network. From the safe meadow hub you can jump to:
//   - FRONTIER portals: deeper into the mainland gradient (skip the walk).
//   - ISLE portals: the outer biomes across the Sunder Strait — places you
//     cannot reach on foot at all, only by portal.
// Every destination has a matching return portal at its entrance that brings
// you home. Portals are world fixtures (server-placed, never saved) so they
// rebuild deterministically at every boot and never collide with player builds.

import { world } from './state.js';
import { REGIONS, regionEntranceX } from '../shared/regions.js';
import { SPAWN_X } from '../shared/const.js';
import { groundAt, streamAt, STREAM_HALF } from '../shared/terrain.js';
import { STRUCTURES } from '../shared/structures.js';

const HUB0 = 980, HUB_SPACING = 200;
const HUB_HUE = 205; // return portals glow blue

// Hub destinations, left-to-right along the hub. isle: crosses the strait.
const DESTS = [
  { idx: 2, hue: 96 },           // Rocky Highlands  (frontier)
  { idx: 3, hue: 40 },           // Deep Wilds       (frontier)
  { idx: 4, hue: 12 },           // Scorched Badlands (frontier)
  { idx: 6, hue: 140, isle: true }, // Verdant Canopy
  { idx: 7, hue: 190, isle: true }, // Frozen Reach
  { idx: 8, hue: 88,  isle: true }, // Fetid Mire
  { idx: 9, hue: 6,   isle: true }, // Emberpeak
];

// Nudge an x clear of any stream basin so portals never sit in (or land you in)
// water. Deterministic since streamAt is seed-derived.
function dryX(x) {
  const s = streamAt(x);
  return s ? Math.round(s.c + Math.sign(s.d || 1) * (STREAM_HALF + 60)) : x;
}

function makePortal(id, x, dest, label, hue, isle) {
  const def = STRUCTURES.portal;
  return {
    id, kind: 'portal',
    x: Math.round(x - def.w / 2),
    y: Math.round(groundAt(x) - def.h),
    dest: Math.round(dest), label, hue, isle: !!isle, owner: null,
  };
}

export function setupPortals() {
  for (const [id, s] of world.structures) if (s.kind === 'portal') world.structures.delete(id);

  DESTS.forEach((dst, k) => {
    const region = REGIONS[dst.idx];
    const hubX = HUB0 + k * HUB_SPACING;
    const entrance = dryX(regionEntranceX(dst.idx)); // return portal on dry ground
    // outbound: hub -> destination (land a little before the return portal, dry)
    const out = makePortal(`pt_h${dst.idx}`, hubX, dryX(entrance - 150), region.name, dst.hue, dst.isle);
    // return: destination entrance -> hub
    const back = makePortal(`pt_r${dst.idx}`, entrance, SPAWN_X - 40, 'Hub', HUB_HUE, false);
    world.structures.set(out.id, out);
    world.structures.set(back.id, back);
  });
  console.log(`portals: ${DESTS.length * 2} placed (${DESTS.filter((d) => d.isle).length} isle + ${DESTS.filter((d) => !d.isle).length} frontier + returns)`);
}
