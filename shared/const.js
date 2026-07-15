// World + gameplay constants shared by server and client.

// World width comes from the region layout so the two never drift apart.
export { WORLD_W } from './regions.js';
export const GROUND_Y = 602;        // nominal ground; real surface is terrain.groundAt(x)

export const GRAVITY = 2200;        // px/s^2
export const MOVE_SPEED = 280;      // px/s
export const JUMP_VEL = 780;        // px/s
export const PLAYER_W = 28;
export const PLAYER_H = 56;

export const HARVEST_RANGE = 95;
export const INTERACT_RANGE = 95;
export const SWING_COOLDOWN_MS = 400;

export const NODE_RESPAWN_MS = 180000; // depleted resources return after 3 min
export const DAY_LENGTH_S = 480;       // full day/night cycle
export const NIGHT_FRAC = 0.35;        // last 35% of the cycle is night

export const TICK_HZ = 20;
export const SNAP_HZ = 10;

export const GRID = 96;             // building grid cell (px)
export const MAX_WALL_STACK = 2;
export const BUILD_REACH = 340;     // max distance player center -> structure center

export const MAX_PLAYERS = 8;
export const SPAWN_X = 800;
export const NAME_MAX = 16;
export const CHAT_MAX = 140;

export const STATS_MAX = 100;
export const HUNGER_DRAIN_PS = 1 / 12;   // hunger per second
export const THIRST_DRAIN_PS = 1 / 9;    // thirst drains a bit faster than hunger
export const STARVE_HP_PS = 1 / 3;       // hp lost per second at 0 hunger/thirst
export const REGEN_HP_PS = 0.25;         // hp per second when fed + watered
export const REGEN_HUNGER_MIN = 40;
export const REGEN_THIRST_MIN = 25;
export const DRINK_AMOUNT = 45;          // thirst restored per stream drink
