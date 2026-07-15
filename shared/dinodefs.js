// Dino species definitions. Adding a species = adding an entry here plus a
// sprite painter in public/js/r_ent.js and a spawn weight in a region's table.
//
// behavior: 'passive'  wanders, flees when hit, can be tamed
//           'aggressive' wanders, chases + bites players inside aggro range
// defensive: a passive that turns and fights (not flees) when struck
// shape:    client silhouette — 'dodo' | 'quadruped' | undefined (theropod)
// tame:     present if the species can be tamed. method 'feed' (default) is
//           passive taming (feed `food` at range). method 'subdue' is carnivore
//           training: knock its hp below `subdueFrac` of max, then feed `food`
//           while it's down.
// rideable: tamed mounts you can ride (press R)
// threat:   0 harmless .. 4 lethal — drives the HUD danger read

export const DINODEFS = {
  dodo: {
    name: 'Dodo', w: 52, h: 44, threat: 0,
    hp: 40, speed: 55, fleeSpeed: 130,
    behavior: 'passive',
    // Combat stats on passives are only used by TAMED guard duty — a wild
    // dodo never bites anything.
    dmg: 6, attackRange: 40, attackCd: 1.2,
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
    // Tamed guard duty only: a tail swipe that can fight off a lone raptor.
    dmg: 20, attackRange: 70, attackCd: 1.1,
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

  // --- carnivores you TRAIN by subduing (knock down, then feed meat) --------
  troodon: {
    name: 'Troodon', w: 46, h: 40, threat: 2,
    hp: 46, speed: 172, fleeSpeed: 180,
    behavior: 'aggressive', dmg: 12, aggro: 440, attackRange: 46, attackCd: 0.9,
    packMin: 2, timid: true,            // a pack hunter — bold in numbers, skittish alone
    drops: { raw_meat: [1, 2], hide: [1, 1] },
    tame: { method: 'subdue', food: 'raw_meat', feeds: 4, cooldownS: 4, subdueFrac: 0.32 },
  },
  sarco: {
    name: 'Sarco', w: 96, h: 52, threat: 3, shape: 'quadruped',
    hp: 200, speed: 118, fleeSpeed: 132,
    behavior: 'aggressive', dmg: 22, aggro: 460, attackRange: 62, attackCd: 1.1,
    drops: { raw_meat: [3, 5], hide: [3, 5] },
    tame: { method: 'subdue', food: 'raw_meat', feeds: 6, cooldownS: 5, subdueFrac: 0.3 },
  },
  sabertooth: {
    name: 'Sabertooth', w: 84, h: 58, threat: 3, shape: 'quadruped',
    hp: 155, speed: 206, fleeSpeed: 206,
    behavior: 'aggressive', dmg: 24, aggro: 520, attackRange: 54, attackCd: 0.8,
    drops: { raw_meat: [2, 3], hide: [2, 4] },
    tame: { method: 'subdue', food: 'raw_meat', feeds: 5, cooldownS: 5, subdueFrac: 0.3 },
  },
  carno: {
    name: 'Carno', w: 128, h: 96, threat: 3,
    hp: 260, speed: 150, fleeSpeed: 150,
    behavior: 'aggressive', dmg: 30, aggro: 560, attackRange: 80, attackCd: 1.1,
    drops: { raw_meat: [4, 6], hide: [3, 5] },
    tame: { method: 'subdue', food: 'raw_meat', feeds: 6, cooldownS: 5, subdueFrac: 0.28 },
  },

  // --- a defensive herbivore: leaves you alone until struck, then charges;
  //     knock it down and it tames on berries ---------------------------------
  trike: {
    name: 'Trike', w: 120, h: 84, threat: 2, shape: 'quadruped',
    hp: 320, speed: 92, fleeSpeed: 120,
    behavior: 'passive', defensive: true,
    dmg: 26, attackRange: 72, attackCd: 1.4, aggro: 470,
    drops: { raw_meat: [3, 5], hide: [4, 6] },
    tame: { method: 'subdue', food: 'berry', feeds: 10, cooldownS: 6, subdueFrac: 0.35 },
    egg: [300, 420],
  },

  // --- the mobile stronghold: a huge sauropod. Knock it down (it tail-swipes
  //     back, so it is a real fight), then feed berries. Rideable, carries a
  //     large built-in stash, and anchors a "dino base". -----------------------
  bronto: {
    name: 'Bronto', w: 244, h: 156, threat: 1, shape: 'sauropod',
    hp: 1400, speed: 60, fleeSpeed: 74,
    behavior: 'passive', defensive: true,
    dmg: 40, attackRange: 130, attackCd: 1.9, aggro: 430,
    drops: { raw_meat: [12, 18], hide: [12, 18] },
    tame: { method: 'subdue', food: 'berry', feeds: 16, cooldownS: 6, subdueFrac: 0.42 },
    rideable: true, rideSpeed: 150, rideJump: 360,
    stash: 48, // built-in mobile storage (deposit/withdraw like a box)
    egg: [520, 760],
  },

  // --- the apex. Massive, fast for its size, hits like a truck, and sees you
  //     coming from a screen away. An encounter is very bad news; it lives only
  //     in the deep expedition frontier. Not tameable. ------------------------
  giga: {
    name: 'Giganotosaurus', w: 224, h: 168, threat: 5,
    hp: 1300, speed: 150, fleeSpeed: 150,
    behavior: 'aggressive', dmg: 120, aggro: 900, attackRange: 140, attackCd: 1.5,
    drops: { raw_meat: [18, 26], hide: [14, 22] },
  },
};

// Player melee damage by equipped tool type (metal + guns arrive in the tech
// tier). Higher-tier gear = more damage — "higher quality items are better".
export const WEAPON_DMG = {
  hand: 5, axe: 14, pick: 11, spear: 22,
  metal_axe: 30, metal_pick: 24, sword: 42, gun: 68,
};
