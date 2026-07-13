// Dino species definitions. Adding a species = adding an entry here plus a
// sprite painter in public/js/r_ent.js and a spawn weight in a region's table.
//
// behavior: 'passive'  wanders, flees when hit, can be tamed
//           'aggressive' wanders, chases + bites players inside aggro range
// tame:     present if the species can be passively tamed (fed `food`)
// rideable: tamed mounts you can ride (press R)
// threat:   0 harmless .. 4 lethal — drives the HUD danger read

export const DINODEFS = {
  dodo: {
    name: 'Dodo', w: 52, h: 44, threat: 0,
    hp: 40, speed: 55, fleeSpeed: 130,
    behavior: 'passive',
    drops: { raw_meat: [2, 3], hide: [1, 2] },
    tame: { food: 'berry', feeds: 8, cooldownS: 8 },
    egg: [180, 300],
  },
  compy: {
    name: 'Compy', w: 34, h: 30, threat: 1,
    hp: 16, speed: 122, fleeSpeed: 150,
    behavior: 'aggressive', dmg: 4, aggro: 340, attackRange: 44, attackCd: 1.0,
    packMin: 2, timid: true,           // flees when hurt and alone-ish
    drops: { raw_meat: [1, 1], hide: [0, 1] },
  },
  dilo: {
    name: 'Dilo', w: 58, h: 50, threat: 2,
    hp: 55, speed: 96, fleeSpeed: 140,
    behavior: 'aggressive', dmg: 9, aggro: 430, attackRange: 56, attackCd: 1.3,
    drops: { raw_meat: [2, 3], hide: [1, 2] },
  },
  parasaur: {
    name: 'Parasaur', w: 104, h: 82, threat: 0,
    hp: 150, speed: 78, fleeSpeed: 165,
    behavior: 'passive',
    drops: { raw_meat: [3, 5], hide: [3, 5] },
    tame: { food: 'berry', feeds: 12, cooldownS: 7 },
    egg: [240, 360],
    rideable: true, rideSpeed: 250, rideJump: 720,
  },
  raptor: {
    name: 'Raptor', w: 74, h: 62, threat: 3,
    hp: 95, speed: 188, fleeSpeed: 188,
    behavior: 'aggressive', dmg: 22, aggro: 540, attackRange: 60, attackCd: 0.85,
    drops: { raw_meat: [3, 4], hide: [2, 3] },
  },
  rex: {
    name: 'T-Rex', w: 156, h: 122, threat: 4,
    hp: 440, speed: 92, fleeSpeed: 92,
    behavior: 'aggressive', dmg: 58, aggro: 600, attackRange: 100, attackCd: 1.5,
    drops: { raw_meat: [8, 12], hide: [6, 10] },
  },
};

// Player melee damage by equipped tool type (metal + guns arrive in the tech
// tier). Higher-tier gear = more damage — "higher quality items are better".
export const WEAPON_DMG = {
  hand: 5, axe: 14, pick: 11, spear: 22,
  metal_axe: 30, metal_pick: 24, sword: 42, gun: 68,
};
