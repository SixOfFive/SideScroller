// DOM panels: toasts, inventory + crafting, storage box, build bar, help.

import { on, sendMsg } from './net.js';
import { state } from './state.js';
import { ITEMS, itemName } from '/shared/items.js';
import { RECIPES, CRAFTABLES, BUILDABLES } from '/shared/recipes.js';

const $ = (id) => document.getElementById(id);

function el(tag, cls, text) {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (text !== undefined) e.textContent = text;
  return e;
}

export function toast(msg) {
  const d = el('div', 'toast', msg);
  $('toasts').append(d);
  setTimeout(() => d.remove(), 2700);
}

// --- inventory + crafting ----------------------------------------------------

const ITEM_ORDER = ['wood', 'thatch', 'stone', 'flint', 'fiber', 'hide',
  'berry', 'egg', 'raw_meat', 'cooked_meat', 'stone_axe', 'stone_pick', 'spear'];

function costLine(cost) {
  const span = el('span', 'cost');
  Object.entries(cost).forEach(([item, qty], i) => {
    const have = state.me.inv[item] || 0;
    const part = el('span', have >= qty ? '' : 'miss', `${i ? ', ' : ''}${qty} ${itemName(item)}`);
    span.append(part);
  });
  return span;
}

function refreshInv() {
  const panel = $('invPanel');
  if (panel.classList.contains('hidden')) return;
  panel.replaceChildren();
  panel.append(el('h2', '', `${state.name} — Inventory`));

  const cols = el('div', 'cols');
  const left = el('div');
  const right = el('div');
  cols.append(left, right);
  panel.append(cols);

  left.append(el('h3', '', 'Items'));
  const ids = ITEM_ORDER.filter((i) => state.me.inv[i]);
  if (!ids.length) left.append(el('p', 'cost', 'Nothing yet — punch a tree!'));
  for (const id of ids) {
    const row = el('div', 'itemrow');
    row.append(el('span', 'qty', `×${state.me.inv[id]}`), el('span', 'nm', itemName(id)));
    const def = ITEMS[id];
    if (def.food) {
      const b = el('button', '', 'Eat');
      b.onclick = () => sendMsg({ t: 'eat', item: id });
      row.append(b);
    }
    if (def.tool) {
      const equipped = state.me.equip === id;
      const b = el('button', '', equipped ? 'Unequip' : 'Equip');
      b.onclick = () => sendMsg({ t: 'equip', item: equipped ? '' : id });
      row.append(b);
    }
    left.append(row);
  }

  right.append(el('h3', '', 'Craft'));
  for (const id of CRAFTABLES) {
    const r = RECIPES[id];
    const box = el('div', 'recipe');
    box.append(el('span', 'rname', r.name), el('br'), costLine(r.cost), el('br'));
    if (r.desc) box.append(el('span', 'desc', r.desc), el('br'));
    const b = el('button', '', 'Craft');
    b.disabled = !Object.entries(r.cost).every(([i, q]) => (state.me.inv[i] || 0) >= q);
    b.onclick = () => sendMsg({ t: 'craft', id });
    box.append(b);
    right.append(box);
  }
  right.append(el('p', 'cost', 'Structures are placed with the build bar — press Q.'));
}

export function toggleInv() {
  const p = $('invPanel');
  p.classList.toggle('hidden');
  refreshInv();
}

// --- storage box ---------------------------------------------------------------

let storageOpenId = null;

function transferRow(list, id, qty, dir) {
  const row = el('div', 'itemrow');
  row.append(el('span', 'qty', `×${qty}`), el('span', 'nm', itemName(id)));
  const b10 = el('button', '', dir === 'deposit' ? '→ 10' : '← 10');
  b10.onclick = () => sendMsg({ t: 'use', id: storageOpenId, action: dir, item: id, qty: 10 });
  const b1 = el('button', '', dir === 'deposit' ? '→ 1' : '← 1');
  b1.onclick = () => sendMsg({ t: 'use', id: storageOpenId, action: dir, item: id, qty: 1 });
  row.append(b1, b10);
  list.append(row);
}

function refreshStorage() {
  if (!storageOpenId) return;
  const s = state.structures.get(storageOpenId);
  const panel = $('storagePanel');
  if (!s) { closeStorage(); return; }
  panel.replaceChildren();
  panel.append(el('h2', '', `Storage Box (${s.owner})`));
  const cols = el('div', 'cols');
  const mine = el('div');
  const box = el('div');
  cols.append(mine, box);
  panel.append(cols);

  mine.append(el('h3', '', 'Your items → deposit'));
  for (const id of ITEM_ORDER.filter((i) => state.me.inv[i])) {
    transferRow(mine, id, state.me.inv[id], 'deposit');
  }
  box.append(el('h3', '', 'Box contents → take'));
  const items = Object.keys(s.inv || {});
  if (!items.length) box.append(el('p', 'cost', 'Empty.'));
  for (const id of ITEM_ORDER.filter((i) => (s.inv || {})[i])) {
    transferRow(box, id, s.inv[id], 'withdraw');
  }
  panel.append(el('p', 'cost', 'Esc to close'));
}

export function openStorage(id) {
  storageOpenId = id;
  $('storagePanel').classList.remove('hidden');
  refreshStorage();
}

export function closeStorage() {
  storageOpenId = null;
  $('storagePanel').classList.add('hidden');
}

// --- build bar -------------------------------------------------------------------

function refreshBuildBar() {
  const bar = $('buildBar');
  if (bar.classList.contains('hidden')) return;
  bar.replaceChildren();
  for (const kind of BUILDABLES) {
    const r = RECIPES[kind];
    const b = el('button', state.build === kind ? 'sel' : '', r.name);
    b.title = Object.entries(r.cost).map(([i, q]) => `${q} ${itemName(i)}`).join(', ')
      + (r.desc ? ` — ${r.desc}` : '');
    b.onclick = () => {
      state.build = state.build === kind ? null : kind;
      refreshBuildBar();
    };
    bar.append(b);
  }
}

export function toggleBuildBar() {
  const bar = $('buildBar');
  bar.classList.toggle('hidden');
  if (bar.classList.contains('hidden')) state.build = null;
  else refreshBuildBar();
}

export function cancelBuild() {
  state.build = null;
  $('buildBar').classList.add('hidden');
}

// --- help -----------------------------------------------------------------------

const HELP_HTML = `
<h2>How to survive</h2>
<p><span class="kbd">A</span>/<span class="kbd">D</span> move · <span class="kbd">Space</span> jump · <span class="kbd">click</span>/<span class="kbd">F</span> harvest &amp; attack</p>
<p><span class="kbd">1</span>–<span class="kbd">4</span> tools · <span class="kbd">Tab</span> inventory &amp; crafting · <span class="kbd">Q</span> build bar · <span class="kbd">G</span> quick-eat</p>
<p><span class="kbd">E</span> interact (light campfire / open box / feed dodo) · <span class="kbd">C</span> cook meat · <span class="kbd">X</span> demolish · <span class="kbd">T</span> dodo follow/stay</p>
<p><span class="kbd">Enter</span> chat · <span class="kbd">H</span> close this help</p>
<h3>The loop</h3>
<p>Punch trees for thatch and wood, grab stones off the ground. Craft a Stone Axe
and Pick — better tools mean way more resources per swing, just like ARK.</p>
<p>Berry bushes keep your food bar up. Build a campfire before night — it gets dark
out there — then a foundation, walls, a doorway and a roof make a fine first hut.</p>
<p>Resources respawn after a few minutes, and the world is richer the further right
you explore. Dodos waddle around out there: hunt them with a spear for meat
(cook it!), or feed them berries to tame your own. Tamed dodos follow you and
lay eggs.</p>
<p>Up to 8 survivors share this world — storage boxes are shared, so co-op away.</p>`;

export function toggleHelp() {
  const p = $('helpPanel');
  p.classList.toggle('hidden');
  if (!p.innerHTML) p.innerHTML = HELP_HTML;
}

export function closeAllPanels() {
  $('invPanel').classList.add('hidden');
  $('helpPanel').classList.add('hidden');
  closeStorage();
  cancelBuild();
}

// --- wiring ---------------------------------------------------------------------

export function initUI() {
  on('toast', (m) => toast(m.msg));
  on('inv', () => { refreshInv(); refreshStorage(); refreshBuildBar(); });
  on('supd', (m) => { if (m.s.id === storageOpenId) refreshStorage(); });
  on('srem', (m) => { if (m.id === storageOpenId) closeStorage(); });
  on('dead', () => toast('You died! Back at the beach.'));
  on('disconnect', () => {
    if (!state.joined) return; // pre-join refusal: keep the real joinErr message
    state.joined = false;
    const j = $('join');
    j.classList.remove('hidden');
    $('joinErr').textContent = 'Disconnected — reload the page to rejoin.';
    $('joinBtn').disabled = true;
  });
}
