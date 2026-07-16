// LLM-driven bot planning (ESC option, off by default). When enabled, each AI
// survivor periodically asks a local LLM to pick its next goal from a fixed
// vocabulary; the heuristic machinery in botbrain.js executes the choice. The
// call is fully async — the 20Hz tick never waits on it — and any failure
// (endpoint down, timeout, bad JSON, unknown goal) simply leaves the heuristic
// ladder driving until a plan lands.
//
// Endpoints: LAN OpenAI-compatible servers. Two are available:
//   http://192.168.15.3:21345  qwen3:4b             (~1.4s/plan — the default)
//   http://192.168.15.3:21351  qwen2.5:14b-instruct (~2.6s/plan — smarter, slower)
// The 4B keeps up with 15 bots re-planning every ~15s through one serialized
// request slot; swap via env SS_LLM_URL / SS_LLM_MODEL to try the 14B.

import { world } from './state.js';
import { DINODEFS } from '../shared/dinodefs.js';
import { PLAYER_W } from '../shared/const.js';
import { EXP_BASE } from '../shared/regions.js';
import { invCount } from './inventory.js';
import { broadcast } from './net.js';

export const LLM_URL = process.env.SS_LLM_URL || 'http://192.168.15.3:21345/v1/chat/completions';
export const LLM_MODEL = process.env.SS_LLM_MODEL || 'qwen3:4b';

// The goal vocabulary the LLM chooses from. botbrain.js maps each name onto
// its existing executor steps — adding a name here without an LLM_EXEC entry
// there means the plan is rejected at execution and re-planned.
export const LLM_GOAL_INFO = {
  craft_axe:         'craft a stone axe (chops wood)',
  craft_pick:        'craft a stone pick (mines stone, flint, metal ore)',
  craft_spear:       'craft a spear (basic weapon)',
  build_campfire:    'place a campfire at camp (cooking, night light)',
  build_hut:         'build the hut: foundations, wall, door, roofs',
  build_storage:     'place a storage box at camp',
  build_forge:       'build a forge (needed to smelt metal)',
  stock_meat:        'hunt dodos and cook meat until 4+ cooked (needs a campfire)',
  stock_berries:     'forage berries until 14+',
  tame_dodo:         'tame a dodo companion with berries',
  craft_metal_tools: 'smelt ingots and craft metal pick, axe, sword (needs a forge)',
  stash_loot:        'haul surplus resources into the storage box',
  go_expedition:     'gear a FULL metal armor set and warp into the frontier to tame a bronto (dangerous; needs a sword)',
  rest:              'stay near camp and wander',
};

const PLAN_S = 14;          // base seconds between re-plans per bot
const PLAN_JITTER_S = 6;
const PLAN_TTL_S = 75;      // a plan older than this is stale — heuristics resume
const FAIL_BACKOFF_S = 18;  // extra wait after a failed request
const TIMEOUT_MS = 12000;
const SAY_COOLDOWN_S = 45;  // per-bot cap on LLM-authored chat lines

const nowS = () => Date.now() / 1000;

let inflight = false;       // one request at a time — kind to a single-GPU box
let failStreak = 0;

const SYSTEM_PROMPT =
  'You pick the next goal for an AI survivor in a 2D multiplayer survival game (gather, craft, build a camp, hunt, tame dinos, reach metal tech, brave the frontier). '
  + 'Choose exactly one goal name from this list:\n'
  + Object.entries(LLM_GOAL_INFO).map(([k, v]) => `- ${k}: ${v}`).join('\n')
  + '\nPrefer what the survivor is missing most; do not pick goals whose requirement is unmet. '
  + 'Reply with ONLY JSON: {"goal":"<name>","say":"<optional short in-character chat line, or empty string>"} /no_think';

// --- world-state summary (compact: the whole prompt stays ~250 tokens) --------

function ownedKinds(bot) {
  const kinds = {};
  for (const s of world.structures.values()) {
    if (s.owner === bot.name) kinds[s.kind] = (kinds[s.kind] || 0) + 1;
  }
  return kinds;
}

function summarize(bot) {
  const inv = bot.inv;
  const tools = ['stone_axe', 'metal_axe', 'stone_pick', 'metal_pick', 'spear', 'sword', 'rifle']
    .filter((t) => invCount(inv, t) > 0);
  const armorN = Object.values(bot.armorSet).filter(Boolean).length;
  const kinds = ownedKinds(bot);
  const hutPieces = (kinds.foundation || 0) + (kinds.wall || 0) + (kinds.doorframe || 0) + (kinds.roof || 0);

  let pets = 0, bronto = false;
  for (const d of world.dinos.values()) {
    if (d.owner !== bot.name) continue;
    pets++;
    if (DINODEFS[d.sp].stash) bronto = true;
  }

  const cx = bot.x + PLAYER_W / 2;
  let danger = 'none';
  for (const d of world.dinos.values()) {
    if (d.owner) continue;
    const def = DINODEFS[d.sp];
    if (def.behavior !== 'aggressive') continue;
    const dist = Math.abs(d.x + def.w / 2 - cx);
    if (dist < 900) { danger = `${def.name} (threat ${def.threat}) ${Math.round(dist)}px away`; break; }
  }

  let botsOut = 0;
  for (const p of world.players.values()) if (p.bot && p.ai.exped) botsOut++;

  const phase = (world.time % world.settings.dayLen) / world.settings.dayLen;
  const counts = ['wood', 'thatch', 'stone', 'flint', 'fiber', 'berry', 'raw_meat', 'cooked_meat', 'metal_ore', 'metal_ingot', 'hide']
    .map((it) => `${it} ${invCount(inv, it)}`).join(', ');

  // Mirror botbrain's can-gates AND done-checks in plain words — a small model
  // picks gated or already-finished goals unless they are called out (the
  // executor re-plans either way, but that churns the endpoint).
  const blocked = [];
  if (!kinds.campfire) blocked.push('stock_meat (no campfire yet)');
  else if (invCount(inv, 'cooked_meat') >= 4) blocked.push('stock_meat (already stocked)');
  if (!kinds.forge) blocked.push('craft_metal_tools (no forge yet)');
  else if (['metal_pick', 'metal_axe', 'sword'].every((t) => invCount(inv, t) > 0)) blocked.push('craft_metal_tools (already made)');
  if (!tools.includes('sword')) blocked.push('go_expedition (no sword yet)');
  else if (bot.ai.expCooldown > 0 || botsOut >= 4) blocked.push('go_expedition (resting or squads full)');
  if (!kinds.storage_box) blocked.push('stash_loot (no storage box yet)');
  if (invCount(inv, 'berry') >= 14) blocked.push('stock_berries (already stocked)');
  if (pets > 0) blocked.push('tame_dodo (already have a pet)');
  if (tools.includes('stone_axe') || tools.includes('metal_axe')) blocked.push('craft_axe (done)');
  if (tools.includes('stone_pick') || tools.includes('metal_pick')) blocked.push('craft_pick (done)');
  if (tools.includes('spear') || tools.includes('sword')) blocked.push('craft_spear (done)');
  if (kinds.campfire) blocked.push('build_campfire (done)');
  if (hutPieces >= 6) blocked.push('build_hut (done)');
  if (kinds.storage_box) blocked.push('build_storage (done)');
  if (kinds.forge) blocked.push('build_forge (done)');

  return `Survivor ${bot.name}: hp ${Math.round(bot.hp)}/100, food ${Math.round(bot.hunger)}, water ${Math.round(bot.thirst)}. Time: ${phase < 0.66 ? 'day' : 'night'}.\n`
    + `Tools: ${tools.join(', ') || 'none'}. Metal armor worn: ${armorN}/4 pieces.\n`
    + `Inventory: ${counts}.\n`
    + `Camp: campfire ${kinds.campfire ? 'yes' : 'no'}, hut ${hutPieces}/6 pieces, storage box ${kinds.storage_box ? 'yes' : 'no'}, forge ${kinds.forge ? 'yes' : 'no'}.\n`
    + `Pets: ${pets}. Own a bronto: ${bronto ? 'yes' : 'no'}. Frontier squads out: ${botsOut}/4.\n`
    + (blocked.length ? `Done or unavailable, do NOT pick: ${blocked.join('; ')}.\n` : '')
    + 'Pick the next goal.';
}

// --- the request cycle ---------------------------------------------------------

function parsePlan(text) {
  // qwen3 prepends a (possibly empty) <think> block even with /no_think.
  text = text.replace(/<think>[\s\S]*?<\/think>/g, '');
  const m = text.match(/\{[\s\S]*\}/);
  if (!m) return null;
  let obj;
  try { obj = JSON.parse(m[0]); } catch { return null; }
  if (typeof obj.goal !== 'string' || !(obj.goal in LLM_GOAL_INFO)) return null;
  const say = typeof obj.say === 'string' ? obj.say.replace(/\s+/g, ' ').trim().slice(0, 90) : '';
  return { goal: obj.goal, say };
}

async function requestPlan(bot) {
  const body = {
    model: LLM_MODEL,
    messages: [
      { role: 'system', content: SYSTEM_PROMPT },
      { role: 'user', content: summarize(bot) },
    ],
    temperature: 0.4,
    max_tokens: 140,
  };
  const ctl = new AbortController();
  const timer = setTimeout(() => ctl.abort(), TIMEOUT_MS);
  try {
    const res = await fetch(LLM_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
      signal: ctl.signal,
    });
    if (!res.ok) throw new Error(`http ${res.status}`);
    const data = await res.json();
    const plan = parsePlan(data.choices?.[0]?.message?.content || '');
    if (!plan) throw new Error('unparseable plan');
    // The bot may have despawned or warped into the frontier mid-request —
    // a plan for the mainland brain would be nonsense there. Drop it.
    if (!world.players.has(bot.id) || bot.x + PLAYER_W / 2 >= EXP_BASE) return;
    bot.ai.llmPlan = { goal: plan.goal, at: nowS() };
    if (plan.goal !== bot.ai.llmLastDone) bot.ai.llmLastDone = null; // a fresh pick resets the churn strike
    failStreak = 0;
    console.log(`llm: ${bot.name} -> ${plan.goal}`);
    if (plan.say && !(bot.ai.llmSayCd > nowS())) {
      bot.ai.llmSayCd = nowS() + SAY_COOLDOWN_S;
      broadcast({ t: 'chat', from: bot.name, text: plan.say });
    }
  } finally {
    clearTimeout(timer);
  }
}

// Called every think while the ESC option is on: fire an async re-plan when
// this bot is due and the request slot is free. Never blocks, never throws.
export function llmPlanTick(bot) {
  const ai = bot.ai;
  if (ai.llmNextAt == null) ai.llmNextAt = nowS() + Math.random() * 8; // stagger the fleet
  if (inflight || nowS() < ai.llmNextAt) return;
  inflight = true;
  ai.llmNextAt = nowS() + PLAN_S + Math.random() * PLAN_JITTER_S;
  requestPlan(bot)
    .catch((e) => {
      ai.llmNextAt = nowS() + FAIL_BACKOFF_S + Math.random() * 10;
      failStreak++;
      if (failStreak === 1 || failStreak % 5 === 0) {
        console.log(`llm: plan for ${bot.name} failed (${e.message}) — heuristics carry on [${failStreak} in a row]`);
      }
    })
    .finally(() => { inflight = false; });
}

// The bot's current LLM-chosen goal name, or null when there is no live plan
// (none yet, expired, or planning failing) — callers fall back to heuristics.
export function llmGoal(bot) {
  const p = bot.ai.llmPlan;
  if (!p || nowS() - p.at > PLAN_TTL_S) return null;
  return p.goal;
}

// The plan's wish is fulfilled (or can't be acted on here): clear it and pull
// the next ask forward so the bot doesn't idle out the rest of the period —
// unless the model just re-picked the goal we already declared finished, in
// which case asking again immediately would loop; sit out a full period.
export function llmPlanDone(bot) {
  const goal = bot.ai.llmPlan?.goal;
  bot.ai.llmPlan = null;
  if (goal && bot.ai.llmLastDone === goal) {
    bot.ai.llmNextAt = nowS() + PLAN_S + Math.random() * PLAN_JITTER_S;
    return;
  }
  if (goal) bot.ai.llmLastDone = goal;
  bot.ai.llmNextAt = Math.min(bot.ai.llmNextAt ?? Infinity, nowS() + 2 + Math.random() * 2);
}
