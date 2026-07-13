// Crafting recipes. Entries with `structure` are built via build mode
// (cost is charged at placement); the rest are crafted from the inventory panel.

export const RECIPES = {
  stone_axe: {
    name: 'Stone Axe', gives: { stone_axe: 1 },
    cost: { wood: 1, thatch: 10, flint: 1 },
    desc: 'Chops more wood from trees.',
  },
  stone_pick: {
    name: 'Stone Pick', gives: { stone_pick: 1 },
    cost: { wood: 1, thatch: 10, stone: 1 },
    desc: 'Mines more stone and flint from rocks.',
  },
  spear: {
    name: 'Spear', gives: { spear: 1 },
    cost: { wood: 2, fiber: 12, flint: 2 },
    desc: 'A hunting weapon. Dodos beware.',
  },
  campfire: {
    name: 'Campfire', structure: 'campfire',
    cost: { thatch: 12, wood: 2, flint: 1, stone: 16 },
    desc: 'Burns wood for light and warmth. Cooks raw meat.',
  },
  storage_box: {
    name: 'Storage Box', structure: 'storage_box',
    cost: { wood: 25, thatch: 20, fiber: 10 },
    desc: 'Shared storage for your tribe.',
  },
  foundation: {
    name: 'Thatch Foundation', structure: 'foundation',
    cost: { thatch: 20, wood: 6, fiber: 15 },
    desc: 'The base of any hut. Walls need one below.',
  },
  wall: {
    name: 'Thatch Wall', structure: 'wall',
    cost: { thatch: 15, wood: 2, fiber: 7 },
    desc: 'Solid wall. Stacks two high on a foundation.',
  },
  doorframe: {
    name: 'Thatch Doorway', structure: 'doorframe',
    cost: { thatch: 12, wood: 2, fiber: 6 },
    desc: 'A wall you can walk through.',
  },
  roof: {
    name: 'Thatch Roof', structure: 'roof',
    cost: { thatch: 15, wood: 2, fiber: 7 },
    desc: 'Caps a wall. You can stand on it.',
  },
};

export const BUILDABLES = Object.keys(RECIPES).filter((k) => RECIPES[k].structure);
export const CRAFTABLES = Object.keys(RECIPES).filter((k) => !RECIPES[k].structure);
