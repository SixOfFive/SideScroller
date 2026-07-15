// The AI survivor "brain": one decision pass per bot every half second.
// Bots act through route() — the same message handlers real clients use — so
// every economy rule (costs, ranges, swing cooldowns) applies to them too.
// The brain only ever writes ai.moveTarget; bots.js walks them there.

import { world } from './state.js';
import { route } from './handlers.js';
import { ITEMS, isItem } from '../shared/items.js';
import { RECIPES } from '../shared/recipes.js';
import { STRUCTURES } from '../shared/structures.js';
import { computePlacement, magneticPlacement } from '../shared/place.js';
import { DINODEFS } from '../shared/dinodefs.js';
import {
  WORLD_W, PLAYER_W, PLAYER_H, HARVEST_RANGE, INTERACT_RANGE, GRID, STATS_MAX,
} from '../shared/const.js';
import { inWater, streamsIn } from '../shared/terrain.js';
import { REGION_W } from '../shared/regions.js';
import { invCount, invHas } from './inventory.js';
import { broadcast } from './net.js';

export const THINK_S = 0.5;

const clamp = (v, lo, hi) => Math.min(Math.max(v, lo), hi);
const center = (p) => p.x + PLAYER_W / 2;
const dinoCx = (d) => d.x + DINODEFS[d.sp].w / 2;
const pick = (arr) => arr[Math.floor(Math.random() * arr.length)];

const ROAM = 1700;            // preferred gathering radius around home
const WEAPONS = ['sword', 'spear', 'stone_axe'];

// Which node kind yields each raw resource, and the best tool to swing at it.
const SOURCES = {
  thatch:    { node: 'tree',  tools: [] },
  wood:      { node: 'tree',  tools: ['metal_axe', 'stone_axe'] },
  stone:     { node: 'rock',  tools: ['metal_pick', 'stone_pick'] },
  flint:     { node: 'rock',  tools: ['metal_pick', 'stone_pick'] },
  fiber:     { node: 'bush',  tools: [] },
  berry:     { node: 'bush',  tools: [] },
  metal_ore: { node: 'metal', tools: ['metal_pick', 'stone_pick'] },
};

// --- small queries ------------------------------------------------------------

function bestTool(bot, list) {
  for (const t of list) if (invCount(bot.inv, t) > 0) return t;
  return '';
}

function ensureEquip(bot, item) {
  if (bot.equip !== item) route(bot, { t: 'equip', item });
}

function haveTool(bot, ...items) {
  return items.some((i) => invCount(bot.inv, i) > 0);
}

function ownedOfKind(bot, kind) {
  const out = [];
  for (const s of world.structures.values()) {
    if (s.owner === bot.name && s.kind === kind) out.push(s);
  }
  return out;
}
const countOwned = (bot, kind) => ownedOfKind(bot, kind).length;

function ownsDino(bot) {
  for (const d of world.dinos.values()) if (d.owner === bot.name) return true;
  return false;
}

// Nearest live node of a kind, preferring home turf but allowing a trek
// (metal only exists in the highlands and beyond).
function findNode(bot, kind) {
  let best = null, bd = Infinity;
  const cx = center(bot), hx = bot.ai.home;
  for (const n of world.nodes.values()) {
    if (n.dep || n.kind !== kind) continue;
    const d = Math.abs(n.x - cx) + (Math.abs(n.x - hx) > ROAM ? 2400 : 0);
    if (d < bd) { bd = d; best = n; }
  }
  return best;
}

function findWild(bot, filter, range) {
  let best = null, bd = range;
  const cx = center(bot);
  for (const d of world.dinos.values()) {
    if (d.owner) continue;
    const dist = Math.abs(dinoCx(d) - cx);
    if (dist < bd && filter(d, DINODEFS[d.sp])) { bd = dist; best = d; }
  }
  return best;
}

// Most dangerous aggressive dino close enough to matter.
function dangerNear(bot) {
  const cx = center(bot);
  // Inside the hub meadow wild dinos never target players (the server's
  // nearestPlayer skips anyone below SAFE_X) — strays that wander in are all
  // bark. Don't flee ghosts, or the flee reflex starves out everything else.
  if (cx < REGION_W) return null;
  let worst = null, score = -1;
  for (const d of world.dinos.values()) {
    if (d.owner) continue;
    const def = DINODEFS[d.sp];
    if (def.behavior !== 'aggressive') continue;
    const dist = Math.abs(dinoCx(d) - cx);
    // Spot a raptor/rex beyond its own aggro radius — running starts early.
    const trigger = def.threat >= 3 ? 620 : 260;
    if (dist < trigger && def.threat > score) { score = def.threat; worst = d; }
  }
  return worst;
}

// Walk toward x; true once within `arrive` px of it.
function goto(bot, x, arrive = 26) {
  if (Math.abs(center(bot) - x) <= arrive) { bot.ai.moveTarget = null; return true; }
  bot.ai.moveTarget = clamp(x, 60, WORLD_W - 60);
  return false;
}

function wanderNear(bot, x) {
  if (bot.ai.moveTarget == null && Math.random() < 0.25) {
    bot.ai.moveTarget = clamp(x + (Math.random() - 0.5) * 900, 60, WORLD_W - 60);
  }
}

// --- the camp stash ---------------------------------------------------------------
// Surplus goes into the bot's storage box — visible loot for anyone bold
// enough to rob a camp. The active goal's cost overrides the keep floors so a
// bot never stashes what it's about to spend (no deposit/withdraw churn).

const KEEP = {
  wood: 14, thatch: 25, stone: 20, flint: 6, fiber: 20,
  berry: 30, cooked_meat: 6, raw_meat: 4, egg: 3, hide: 6,
  metal_ore: 8, metal_ingot: 8, charcoal: 4,
};
const KEEP_DEFAULT = 5;

// null = never stash (tools, armor, unknown ids).
function keepFor(bot, item) {
  if (!isItem(item) || ITEMS[item].tool || ITEMS[item].armor) return null;
  return Math.max(KEEP[item] ?? KEEP_DEFAULT, bot.ai.goalCost?.[item] || 0);
}

// Haul surplus home. Returns true while the chore has the turn.
function stashStep(bot) {
  const box = ownedOfKind(bot, 'storage_box')[0];
  if (!box || !box.inv) { bot.ai.stash = false; return false; }
  const over = [];
  let excess = 0;
  for (const [item, qty] of Object.entries(bot.inv)) {
    const keep = keepFor(bot, item);
    if (keep == null || qty <= keep) continue;
    over.push([item, qty - keep]);
    excess += qty - keep;
  }
  if (!over.length) { bot.ai.stash = false; return false; }
  if (!bot.ai.stash && excess < 15) return false; // not worth a trip yet
  bot.ai.stash = true;
  const bx = box.x + STRUCTURES.storage_box.w / 2;
  if (goto(bot, bx, INTERACT_RANGE + 40)) {
    const [item, qty] = over[0]; // one stack per think — looks deliberate
    route(bot, { t: 'use', id: box.id, action: 'deposit', item, qty });
  }
  return true;
}

// --- acquiring resources --------------------------------------------------------

// Work on the first shortfall in a cost object: camp stash first, then farm.
function gatherFor(bot, cost) {
  for (const [item, qty] of Object.entries(cost)) {
    const have = invCount(bot.inv, item);
    if (have >= qty) continue;
    const box = ownedOfKind(bot, 'storage_box')[0];
    if (box && box.inv && (box.inv[item] || 0) > 0) {
      const bx = box.x + STRUCTURES.storage_box.w / 2;
      if (goto(bot, bx, INTERACT_RANGE + 40)) {
        route(bot, { t: 'use', id: box.id, action: 'withdraw', item, qty: qty - have });
      }
      return;
    }
    acquire(bot, item);
    return;
  }
}

function swingAt(bot, x, msg) {
  bot.face = x >= center(bot) ? 1 : -1;
  route(bot, msg);
  bot.ai.swingT = 0.35;
}

function acquire(bot, item) {
  const src = SOURCES[item];
  if (src) {
    const node = findNode(bot, src.node);
    if (!node) { wanderNear(bot, bot.ai.home); return; }
    if (goto(bot, node.x, HARVEST_RANGE - 18)) {
      ensureEquip(bot, bestTool(bot, src.tools));
      swingAt(bot, node.x, { t: 'harvest', node: node.id });
    }
    return;
  }
  if (item === 'metal_ingot' || item === 'charcoal') { smeltStep(bot); return; }
  if (item === 'raw_meat') huntStep(bot);
}

function smeltStep(bot) {
  const forge = ownedOfKind(bot, 'forge')[0];
  if (!forge) return; // the forge goal sits earlier in the ladder
  if (invCount(bot.inv, 'metal_ore') < 1) { acquire(bot, 'metal_ore'); return; }
  if (invCount(bot.inv, 'wood') < 1) { acquire(bot, 'wood'); return; }
  const fx = forge.x + STRUCTURES.forge.w / 2;
  if (goto(bot, fx, INTERACT_RANGE + 40)) {
    route(bot, { t: 'use', id: forge.id, action: 'smelt' });
  }
}

function huntStep(bot) {
  // Never hunt a dodo someone is mid-taming (tame > 0) — attacking would
  // reset the progress, possibly the bot's own (or a player's).
  const prey = findWild(bot, (d) => d.sp === 'dodo' && !(d.tame > 0), 2600);
  if (!prey) { wanderNear(bot, bot.ai.home); return; }
  const px = dinoCx(prey);
  if (goto(bot, px, HARVEST_RANGE - 10)) {
    ensureEquip(bot, bestTool(bot, WEAPONS));
    swingAt(bot, px, { t: 'attack', dino: prey.id });
  }
}

// --- crafting and building -------------------------------------------------------

function craftStep(bot, id) {
  const r = RECIPES[id];
  if (invHas(bot.inv, r.cost)) route(bot, { t: 'craft', id });
  else gatherFor(bot, r.cost);
}

function buildStep(bot, kind, wantX, goalId) {
  const r = RECIPES[kind];
  if (!invHas(bot.inv, r.cost)) { gatherFor(bot, r.cost); return; }
  // Free-standing pieces slide to the nearest clear spot, same as the player
  // ghost — otherwise a box aimed at a spot its own hut overlaps would burn
  // retries and drift the whole camp. Grid pieces keep their raw wantX: their
  // column comes from colOf(wantX), so re-centering would shift them a column.
  if (!STRUCTURES[kind].grid) {
    const probe = magneticPlacement(kind, wantX, world.structures.values());
    if (probe.ok) wantX = probe.x + STRUCTURES[kind].w / 2;
  }
  if (!goto(bot, wantX, 120)) return;
  const before = countOwned(bot, kind);
  route(bot, { t: 'build', kind, x: wantX });
  if (countOwned(bot, kind) === before) {
    // Placement refused (blocked spot, taken column). A few retries, then
    // shift camp east and re-plan around the new anchor.
    const f = (bot.ai.fails[goalId] = (bot.ai.fails[goalId] || 0) + 1);
    if (f >= 5) { bot.ai.home += 240; bot.ai.fails = {}; }
  } else {
    bot.ai.fails[goalId] = 0;
  }
}

// Grid x of the i-th hut column at the bot's camp.
const hutColX = (bot, i) => (Math.round(bot.ai.home / GRID) + i) * GRID;

const colOf = (x) => Math.round(x / GRID);

// Count hut pieces of `kinds` standing on the bot's own foundation columns —
// ANY owner. If a visitor caps the bot's hut with their own roof, the goal is
// met; insisting on bot-owned pieces would stall the ladder forever.
function hutPieces(bot, kinds) {
  const cols = new Set(ownedOfKind(bot, 'foundation').map((f) => colOf(f.x)));
  let n = 0;
  for (const s of world.structures.values()) {
    if (kinds.includes(s.kind) && cols.has(colOf(s.x))) n++;
  }
  return n;
}

// Build a grid piece on whichever of the bot's foundations can actually take
// it (probed with the real placement rules). Walls/doors prefer emptier
// columns so the door lands beside the wall, not stacked on it; roofs prefer
// built-up ones. If no column qualifies, skip this think — the any-owner done
// checks cover the "someone else finished it" case.
function onOwnFoundation(bot, kind, goalId) {
  const all = [...world.structures.values()];
  const scored = ownedOfKind(bot, 'foundation').map((f) => {
    let pieces = 0;
    for (const s of all) {
      if ((s.kind === 'wall' || s.kind === 'doorframe') && colOf(s.x) === colOf(f.x)) pieces++;
    }
    return { f, pieces };
  }).sort((a, b) => (kind === 'roof' ? b.pieces - a.pieces : a.pieces - b.pieces));
  for (const { f } of scored) {
    if (computePlacement(kind, f.x, all).ok) { buildStep(bot, kind, f.x, goalId); return; }
  }
}

function cookedMeatStep(bot) {
  const fire = ownedOfKind(bot, 'campfire')[0];
  if (!fire) return;
  if (invCount(bot.inv, 'raw_meat') < 1) { huntStep(bot); return; }
  const fx = fire.x + STRUCTURES.campfire.w / 2;
  if (!goto(bot, fx, INTERACT_RANGE + 40)) return;
  if (!fire.lit) {
    if (invCount(bot.inv, 'wood') < 1) { acquire(bot, 'wood'); return; }
    route(bot, { t: 'use', id: fire.id, action: 'fuel' });
    return;
  }
  route(bot, { t: 'use', id: fire.id, action: 'cook' });
}

function tameStep(bot) {
  if (invCount(bot.inv, 'berry') < 1) { acquire(bot, 'berry'); return; }
  const prey = findWild(bot, (d, def) => d.sp === 'dodo' && def.tame, 2400);
  if (!prey) { wanderNear(bot, bot.ai.home); return; }
  if (goto(bot, dinoCx(prey), INTERACT_RANGE + 10)) {
    route(bot, { t: 'feed', dino: prey.id }); // feed cooldown gates the pace
  }
}

// --- the tech ladder --------------------------------------------------------------
// First unmet goal wins. Stock goals ('meat', 'berries') re-arm as the bot
// eats through them, so mature bots keep hunting and foraging between projects.

const GOALS = [
  { id: 'axe',      recipe: 'stone_axe', done: (b) => haveTool(b, 'stone_axe', 'metal_axe'),
    step: (b) => craftStep(b, 'stone_axe') },
  { id: 'pick',     recipe: 'stone_pick', done: (b) => haveTool(b, 'stone_pick', 'metal_pick'),
    step: (b) => craftStep(b, 'stone_pick') },
  { id: 'campfire', recipe: 'campfire', done: (b) => countOwned(b, 'campfire') >= 1,
    step: (b) => buildStep(b, 'campfire', b.ai.home - 150, 'campfire') },
  { id: 'spear',    recipe: 'spear', done: (b) => haveTool(b, 'spear', 'sword'),
    step: (b) => craftStep(b, 'spear') },
  { id: 'fndA',     recipe: 'foundation', done: (b) => countOwned(b, 'foundation') >= 1,
    step: (b) => buildStep(b, 'foundation', hutColX(b, 0), 'fndA') },
  { id: 'fndB',     recipe: 'foundation', done: (b) => countOwned(b, 'foundation') >= 2,
    step: (b) => buildStep(b, 'foundation', hutColX(b, 1), 'fndB') },
  { id: 'wall',     recipe: 'wall', done: (b) => hutPieces(b, ['wall']) >= 1,
    step: (b) => onOwnFoundation(b, 'wall', 'wall') },
  { id: 'door',     recipe: 'doorframe', done: (b) => hutPieces(b, ['doorframe']) >= 1,
    step: (b) => onOwnFoundation(b, 'doorframe', 'door') },
  { id: 'roofs',    recipe: 'roof', done: (b) => hutPieces(b, ['roof']) >= 2,
    step: (b) => onOwnFoundation(b, 'roof', 'roofs') },
  { id: 'box',      recipe: 'storage_box', done: (b) => countOwned(b, 'storage_box') >= 1,
    step: (b) => buildStep(b, 'storage_box', b.ai.home + 220, 'box') },
  { id: 'meat',     done: (b) => invCount(b.inv, 'cooked_meat') >= 4,
    step: (b) => cookedMeatStep(b) },
  { id: 'berries',  done: (b) => invCount(b.inv, 'berry') >= 14,
    step: (b) => acquire(b, 'berry') },
  { id: 'tame',     done: (b) => ownsDino(b),
    step: (b) => tameStep(b) },
  { id: 'forge',    recipe: 'forge', done: (b) => countOwned(b, 'forge') >= 1,
    step: (b) => buildStep(b, 'forge', b.ai.home - 280, 'forge') },
  { id: 'mpick',    recipe: 'metal_pick', done: (b) => haveTool(b, 'metal_pick'),
    step: (b) => craftStep(b, 'metal_pick') },
  { id: 'maxe',     recipe: 'metal_axe', done: (b) => haveTool(b, 'metal_axe'),
    step: (b) => craftStep(b, 'metal_axe') },
  { id: 'sword',    recipe: 'sword', done: (b) => haveTool(b, 'sword'),
    step: (b) => craftStep(b, 'sword') },
];

// --- survival interrupts -----------------------------------------------------------

// Drink/eat before working. Returns true if the need took the turn.
function needsStep(bot) {
  const s = world.settings;
  const thirst = bot.thirst ?? STATS_MAX;
  const wet = inWater(center(bot), bot.y + PLAYER_H);
  if (s.thirst && (thirst < 32 || (wet && thirst < 85))) {
    const streams = streamsIn(0, WORLD_W);
    if (streams.length) {
      let c = streams[0].c;
      for (const st of streams) {
        if (Math.abs(st.c - center(bot)) < Math.abs(c - center(bot))) c = st.c;
      }
      if (goto(bot, c, 14)) route(bot, { t: 'drink' });
      return true;
    }
  }
  if (s.hunger && bot.hunger < 35) {
    for (const it of ['cooked_meat', 'egg', 'berry', 'raw_meat']) {
      if (invCount(bot.inv, it) > 0) { route(bot, { t: 'eat', item: it }); return true; }
    }
    acquire(bot, 'berry'); // nothing edible: forage
    return true;
  }
  return false;
}

// Peeking out of the hub: predators that chased a bot to the safe line camp
// there on their leash. If one lurks just across it, hold at a stand-off
// distance — but only so long. Campers can loiter for ages, so after ~20s of
// waiting a healthy bot commits to a dash (dashT suppresses the flee reflex;
// it outruns everything, at worst eating a bite or two on the way through).
function leashGuard(bot) {
  const ai = bot.ai;
  if (ai.dashT > 0) return; // committed to the run
  if (center(bot) >= REGION_W || ai.moveTarget == null || ai.moveTarget <= REGION_W) {
    ai.campWait = 0;
    return;
  }
  for (const d of world.dinos.values()) {
    if (d.owner) continue;
    const def = DINODEFS[d.sp];
    if (def.behavior !== 'aggressive' || def.threat < 2) continue;
    const dx = dinoCx(d);
    if (dx > REGION_W - 80 && dx < REGION_W + 640) {
      ai.campWait = (ai.campWait || 0) + THINK_S;
      if (ai.campWait > 20 && bot.hp > 55) { ai.campWait = 0; ai.dashT = 12; return; }
      ai.moveTarget = Math.min(ai.moveTarget, REGION_W - 280);
      return;
    }
  }
  ai.campWait = 0;
}

// After dark, stay near camp: pull far targets home and keep the fire fed.
function nightStep(bot) {
  const s = world.settings;
  const phase = (world.time % s.dayLen) / s.dayLen;
  if (phase < 0.66) return;
  const fire = ownedOfKind(bot, 'campfire')[0];
  const campX = fire ? fire.x + STRUCTURES.campfire.w / 2 : bot.ai.home;
  const t = bot.ai.moveTarget;
  if (t != null && Math.abs(t - campX) > 950) {
    bot.ai.moveTarget = Math.abs(center(bot) - campX) > 80 ? campX : null;
  }
  if (fire && !fire.lit && invCount(bot.inv, 'wood') > 0
      && Math.abs(center(bot) - campX) <= INTERACT_RANGE + 60) {
    route(bot, { t: 'use', id: fire.id, action: 'fuel' });
  }
}

// --- chatter ---------------------------------------------------------------------

const LINES = {
  gather: ['Just need a bit more thatch…', 'Good haul today.', 'These rocks are stubborn.'],
  build:  ['Base is coming along.', 'One more wall and it holds.', 'Home sweet hut.'],
  hunt:   ['Dodo stew tonight.', 'Dinner keeps running away.', 'Easy there, little one.'],
  metal:  ['Ore run — wish me luck.', 'The forge eats wood like crazy.', 'Metal changes everything.'],
  idle:   ['Quiet out here.', 'Nice night by the fire.', 'Heard a roar out east. Not going.'],
};
const BUCKET = {
  axe: 'gather', pick: 'gather', berries: 'gather',
  campfire: 'build', fndA: 'build', fndB: 'build', wall: 'build',
  door: 'build', roofs: 'build', box: 'build',
  meat: 'hunt', tame: 'hunt',
  forge: 'metal', mpick: 'metal', maxe: 'metal', sword: 'metal',
};

function chatTick(bot) {
  const ai = bot.ai;
  ai.greetT -= THINK_S;
  if (ai.greetT <= 0) {
    for (const o of world.players.values()) {
      if (o.bot || Math.abs(center(o) - center(bot)) > 380) continue;
      ai.greetT = 180;
      broadcast({ t: 'chat', from: bot.name, text: pick([
        `Hey ${o.name}.`, `Good to see you out here, ${o.name}.`, 'Watch the tall grass.',
      ]) });
      break;
    }
  }
  ai.chatT -= THINK_S;
  if (ai.chatT <= 0) {
    ai.chatT = 150 + Math.random() * 180;
    if (Math.random() < 0.6) {
      broadcast({ t: 'chat', from: bot.name, text: pick(LINES[BUCKET[ai.goalId] || 'idle']) });
    }
  }
}

// --- the decision pass -------------------------------------------------------------

export function think(bot) {
  thinkCore(bot);
  // The border guard runs on EVERY exit path — early returns included. A
  // thirsty bot's drink trek east must not walk into a leash-camped raptor.
  leashGuard(bot);
}

function thinkCore(bot) {
  const ai = bot.ai;
  chatTick(bot);

  // Mid-dash through a camped border: keep running, ignore the fear.
  if (ai.dashT > 0) ai.dashT -= THINK_S;

  // 1. danger: flee what would kill us, fight what won't
  const threat = ai.dashT > 0 ? null : dangerNear(bot);
  if (threat) {
    const def = DINODEFS[threat.sp];
    const armed = haveTool(bot, ...WEAPONS);
    if (def.threat >= 3 || !armed || bot.hp < 30) {
      ai.fleeT = 3.0;
      ai.fleeDir = center(bot) < dinoCx(threat) ? -1 : 1;
    } else {
      const px = dinoCx(threat);
      if (goto(bot, px, HARVEST_RANGE - 10)) {
        ensureEquip(bot, bestTool(bot, WEAPONS));
        swingAt(bot, px, { t: 'attack', dino: threat.id });
      }
      return;
    }
  }
  if (ai.fleeT > 0) {
    ai.fleeT -= THINK_S;
    ai.moveTarget = clamp(center(bot) + ai.fleeDir * 600, 60, WORLD_W - 60);
    // A snack on the run — a long chase must not starve the bot out.
    if (world.settings.hunger && bot.hunger < 25) {
      for (const it of ['cooked_meat', 'egg', 'berry']) {
        if (invCount(bot.inv, it) > 0) { route(bot, { t: 'eat', item: it }); break; }
      }
    }
    return;
  }

  // 2. survival needs
  if (needsStep(bot)) return;

  // 3. pick the goal first so the stash chore knows what NOT to deposit
  const goal = GOALS.find((g) => !g.done(bot));
  ai.goalId = goal ? goal.id : 'idle';
  ai.goalCost = goal && goal.recipe ? RECIPES[goal.recipe].cost : null;

  // 4. haul surplus home to the storage box (loot for daring visitors),
  //    otherwise work the ladder / idle patrol
  if (!stashStep(bot)) {
    if (goal) goal.step(bot);
    else wanderNear(bot, ai.home);
  }

  // 5. after dark, pull it all back to camp
  nightStep(bot);
}
