// Canvas HUD: vitals, tool belt, clock, context hints, hovered-node info.

import { cam, VIEW_H } from './camera.js';
import { state, findNearestStructure, findNearestDino } from './state.js';
import { dayPhase } from './r_bg.js';
import { worldTime } from './state.js';
import { INTERACT_RANGE } from '/shared/const.js';
import { DINODEFS } from '/shared/dinodefs.js';
import { STRUCTURES } from '/shared/structures.js';

const SLOTS = [
  { key: '1', item: '', label: 'Hands' },
  { key: '2', item: 'stone_axe', label: 'Axe' },
  { key: '3', item: 'stone_pick', label: 'Pick' },
  { key: '4', item: 'spear', label: 'Spear' },
];

const NODE_NAMES = { tree: 'Tree', rock: 'Stone Pile', bush: 'Berry Bush', metal: 'Metal Vein' };

function bar(ctx, x, y, w, h, frac, color, label) {
  ctx.fillStyle = 'rgba(8,11,20,0.72)';
  ctx.fillRect(x - 2, y - 2, w + 4, h + 4);
  ctx.fillStyle = '#2a3346';
  ctx.fillRect(x, y, w, h);
  ctx.fillStyle = color;
  ctx.fillRect(x, y, w * Math.max(0, Math.min(1, frac)), h);
  ctx.font = 'bold 11px sans-serif';
  ctx.textAlign = 'left';
  ctx.fillStyle = '#fff';
  ctx.fillText(label, x + 5, y + h - 4);
}

function vitals(ctx) {
  const y = VIEW_H - 66;
  bar(ctx, 16, y, 190, 16, state.me.hp / 100, state.me.hp > 30 ? '#c0392b' : '#ff5d4e',
    `HP ${Math.round(state.me.hp)}`);
  bar(ctx, 16, y + 24, 190, 16, state.me.hunger / 100,
    state.me.hunger > 25 ? '#d68a2e' : '#ff8c4e', `FOOD ${Math.round(state.me.hunger)}`);
  if (state.me.hunger <= 20) {
    ctx.font = 'bold 12px sans-serif';
    ctx.fillStyle = `rgba(255,120,90,${0.6 + 0.4 * Math.sin(performance.now() * 0.008)})`;
    ctx.fillText(state.me.hunger <= 0 ? 'STARVING!' : 'Hungry — eat something (G)', 16, y - 8);
  }
}

function toolbelt(ctx, W) {
  const total = SLOTS.length * 52;
  let x = W / 2 - total / 2;
  const y = VIEW_H - 62;
  ctx.font = '10px sans-serif';
  for (const s of SLOTS) {
    const owned = s.item === '' || (state.me.inv[s.item] || 0) > 0;
    const sel = state.me.equip === s.item || (s.item === '' && !state.me.equip);
    ctx.fillStyle = 'rgba(10,14,24,0.8)';
    ctx.fillRect(x, y, 46, 46);
    ctx.strokeStyle = sel ? '#ffd76e' : '#3a4660';
    ctx.lineWidth = sel ? 2.5 : 1.5;
    ctx.strokeRect(x, y, 46, 46);
    ctx.globalAlpha = owned ? 1 : 0.32;
    ctx.fillStyle = '#c8d3e6';
    ctx.textAlign = 'center';
    ctx.fillText(s.label, x + 23, y + 40);
    ctx.font = 'bold 15px sans-serif';
    ctx.fillText(iconFor(s.item), x + 23, y + 24);
    ctx.font = '10px sans-serif';
    ctx.globalAlpha = 1;
    ctx.fillStyle = '#8fa2c0';
    ctx.textAlign = 'left';
    ctx.fillText(s.key, x + 4, y + 12);
    x += 52;
  }
}

function iconFor(item) {
  if (item === 'stone_axe') return '🪓';
  if (item === 'stone_pick') return '⛏';
  if (item === 'spear') return '🔱';
  return '✊';
}

function clock(ctx, W) {
  const phase = dayPhase(worldTime());
  const mins = Math.floor(phase * 24 * 60);
  const hh = String(Math.floor(mins / 60)).padStart(2, '0');
  const mm = String(mins % 60).padStart(2, '0');
  const icon = phase < 0.7 ? '☀' : '☾'; // matches when r_bg swaps sun for moon
  ctx.font = 'bold 14px sans-serif';
  ctx.textAlign = 'right';
  ctx.fillStyle = 'rgba(8,11,20,0.6)';
  ctx.fillRect(W - 150, 12, 138, 26);
  ctx.fillStyle = '#dde4ee';
  ctx.fillText(`${icon} ${hh}:${mm}   ⚑ ${state.players.size + 1}/8`, W - 20, 30);
}

function contextHint(ctx, W) {
  let hint = '';
  if (state.build) {
    hint = 'Click to place · Q / Esc to stop building';
  } else {
    const bits = [];
    const s = findNearestStructure(INTERACT_RANGE + 30, ['campfire', 'storage_box']);
    if (s && s.kind === 'campfire') {
      const left = Math.max(0,
        Math.ceil(s.fuelS - (performance.now() - (s.fuelAt || performance.now())) / 1000));
      bits.push(`E add wood${s.lit && left ? ` (${left}s)` : ' to light'}`);
      if (s.lit && (state.me.inv.raw_meat || 0) > 0) bits.push('C cook meat');
    }
    if (s && s.kind === 'storage_box') bits.push('E open box');
    const own = findNearestStructure(INTERACT_RANGE + 30);
    if (own && own.owner === state.name) bits.push('X demolish');
    const wild = findNearestDino(INTERACT_RANGE + 30, (d) => !d.o);
    if (wild) {
      const def = DINODEFS[wild.sp || 'dodo'];
      const fed = Math.round((wild.tm || 0) * def.tameFeeds);
      if ((state.me.inv[def.tameFood] || 0) > 0) {
        bits.push(`E feed ${def.tameFood === 'berry' ? 'berries' : def.tameFood} (${fed}/${def.tameFeeds})`);
      } else if (wild.tm > 0) {
        bits.push(`need ${def.tameFood === 'berry' ? 'berries' : def.tameFood} to keep taming!`);
      }
    }
    const tame = findNearestDino(220, (d) => d.o === state.name);
    if (tame) bits.push(`T ${tame.s === 'stay' ? 'follow me' : 'stay'}`);
    hint = bits.join('  ·  ');
  }
  if (!hint) return;
  ctx.font = 'bold 13px sans-serif';
  ctx.textAlign = 'center';
  const w = ctx.measureText(hint).width + 24;
  ctx.fillStyle = 'rgba(8,11,20,0.68)';
  ctx.fillRect(W / 2 - w / 2, VIEW_H - 106, w, 24);
  ctx.fillStyle = '#ffe9ad';
  ctx.fillText(hint, W / 2, VIEW_H - 89);
}

function hoverInfo(ctx, W) {
  const n = state.hoverNode;
  if (!n || n.dep) return;
  const label = `${NODE_NAMES[n.kind]}  ${n.hp}/${n.max}`;
  ctx.font = 'bold 13px sans-serif';
  ctx.textAlign = 'center';
  ctx.fillStyle = 'rgba(8,11,20,0.68)';
  ctx.fillRect(W / 2 - 80, 14, 160, 24);
  ctx.fillStyle = '#dde4ee';
  ctx.fillText(label, W / 2, 31);
}

export function drawHud(ctx) {
  ctx.save();
  ctx.scale(cam.scale, cam.scale);
  const W = cam.viewW;
  vitals(ctx);
  toolbelt(ctx, W);
  clock(ctx, W);
  contextHint(ctx, W);
  hoverInfo(ctx, W);
  ctx.restore();
}
