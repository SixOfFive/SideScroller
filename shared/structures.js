// Structure definitions. Coordinates are top-left of the bounding box.
// solid: blocks horizontal movement. platform: can be stood on (one-way, from above).
// grid: snaps to the build grid and uses support rules (see place.js).

export const STRUCTURES = {
  campfire:    { name: 'Campfire',    w: 64, h: 40 },
  storage_box: { name: 'Storage Box', w: 56, h: 44 },
  forge:       { name: 'Forge',       w: 72, h: 60 },
  foundation:  { name: 'Foundation',  w: 96, h: 14, grid: true, platform: true },
  wall:        { name: 'Wall',        w: 96, h: 96, grid: true, solid: true },
  doorframe:   { name: 'Doorway',     w: 96, h: 96, grid: true },
  roof:        { name: 'Roof',        w: 96, h: 14, grid: true, platform: true },
  // World fixtures (server-placed, not craftable):
  portal:      { name: 'Portal',      w: 74, h: 124 },
};
