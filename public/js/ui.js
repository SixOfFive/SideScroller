// DOM panels: toasts, inventory + crafting, storage box, build bar, help.

import { on, sendMsg } from './net.js';
import { state } from './state.js';
import { sfx, setMute } from './sound.js';
import { labelFor, setBind, resetBinds } from './input.js';
import { slotItem, slotOf, assignSlot, clearSlot } from './slots.js';
import { ITEMS, itemName, isArmor } from '/shared/items.js';
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
  'metal_ore', 'metal_ingot', 'charcoal', 'gunpowder', 'bullet',
  'berry', 'egg', 'raw_meat', 'cooked_meat',
  'stone_axe', 'stone_pick', 'spear', 'metal_axe', 'metal_pick', 'sword', 'rifle',
  'metal_helmet', 'metal_chest', 'metal_legs', 'metal_boots',
  'hide_barding', 'metal_barding'];

const ARMOR_SLOTS = [['head', 'Head'], ['chest', 'Chest'], ['legs', 'Legs'], ['feet', 'Feet']];

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

  // What the hotbar keys currently equip (pins + smart fallbacks).
  left.append(el('h3', '', 'Hotbar'));
  left.append(el('p', 'cost', [1, 2, 3, 4]
    .map((n) => `${labelFor('equip' + n)}: ${slotItem(n) === '' ? 'Hands' : itemName(slotItem(n))}`)
    .join(' · ')));

  left.append(el('h3', '', 'Items'));
  const ids = ITEM_ORDER.filter((i) => state.me.inv[i]);
  if (!ids.length) left.append(el('p', 'cost', 'Nothing yet — punch a tree!'));
  for (const id of ids) {
    const row = el('div', 'itemrow');
    row.append(el('span', 'qty', `×${state.me.inv[id]}`), el('span', 'nm', itemName(id)));
    const def = ITEMS[id];
    if (def.food) {
      const b = el('button', '', 'Eat');
      b.onclick = () => { sfx('eat'); sendMsg({ t: 'eat', item: id }); };
      row.append(b);
    }
    if (def.tool) {
      const equipped = state.me.equip === id;
      const b = el('button', '', equipped ? 'Unequip' : 'Equip');
      b.onclick = () => sendMsg({ t: 'equip', item: equipped ? '' : id });
      row.append(b);
      // Pin this tool to a hotbar key; click the lit number again to unpin.
      const cur = slotOf(id);
      for (const n of [1, 2, 3, 4]) {
        const sb = el('button', 'slotbtn' + (cur === n ? ' sel' : ''), labelFor('equip' + n));
        sb.title = cur === n
          ? `Unpin from key ${labelFor('equip' + n)}`
          : `Equip with key ${labelFor('equip' + n)}`;
        sb.onclick = () => { if (cur === n) clearSlot(n); else assignSlot(n, id); refreshInv(); };
        row.append(sb);
      }
    }
    if (def.armor) {
      const b = el('button', '', 'Wear');
      b.onclick = () => sendMsg({ t: 'wear', item: id });
      row.append(b);
    }
    if (def.dinoArmor) {
      const b = el('button', '', 'Bard dino');
      b.title = 'Strap onto your nearest tamed dino';
      b.onclick = () => sendMsg({ t: 'bardDino', item: id });
      row.append(b);
    }
    left.append(row);
  }

  // Worn armor + total protection
  const armor = state.me.armor || {};
  let totalV = 0;
  for (const [slot] of ARMOR_SLOTS) {
    const it = armor[slot];
    if (it && ITEMS[it] && ITEMS[it].armor) totalV += ITEMS[it].armor.v;
  }
  left.append(el('h3', '', `Worn Armor — ${Math.round(Math.min(0.78, totalV / 90) * 100)}% protection`));
  for (const [slot, label] of ARMOR_SLOTS) {
    const it = armor[slot];
    const row = el('div', 'itemrow');
    row.append(el('span', 'qty', label));
    row.append(el('span', 'nm', it ? itemName(it) : '— empty —'));
    if (it) {
      const b = el('button', '', 'Take off');
      b.onclick = () => sendMsg({ t: 'takeoff', slot });
      row.append(b);
    }
    left.append(row);
  }

  right.append(el('h3', '', 'Craft'));
  let shownMetalHeading = false;
  for (const id of CRAFTABLES) {
    const r = RECIPES[id];
    if (r.tier === 2 && !shownMetalHeading) {
      shownMetalHeading = true;
      right.append(el('h3', '', '⚙ Metal Tier'));
    }
    const box = el('div', 'recipe');
    box.append(el('span', 'rname', r.name), el('br'), costLine(r.cost), el('br'));
    if (r.desc) box.append(el('span', 'desc', r.desc), el('br'));
    const b = el('button', '', 'Craft');
    b.disabled = !Object.entries(r.cost).every(([i, q]) => (state.me.inv[i] || 0) >= q);
    b.onclick = () => { sfx('craft'); sendMsg({ t: 'craft', id }); };
    box.append(b);
    right.append(box);
  }
  right.append(el('p', 'cost', 'Structures (incl. the Forge) are placed with the build bar — press Q.'));
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

// Short material codes for the build bar (full names live in the tooltip).
const COST_SHORT = {
  thatch: 'Th', wood: 'Wd', stone: 'St', flint: 'Fl', fiber: 'Fb',
  metal_ingot: 'Ing', charcoal: 'Ch', gunpowder: 'GP',
};

function refreshBuildBar() {
  const bar = $('buildBar');
  if (bar.classList.contains('hidden')) return;
  bar.replaceChildren();
  for (const kind of BUILDABLES) {
    const r = RECIPES[kind];
    const b = el('button', state.build === kind ? 'sel' : '');
    b.append(el('div', 'bname', r.name));
    // Visible requirements, red when you're short — compact codes keep the
    // bar slim so it doesn't blanket the ground you're building on.
    const costEl = el('div', 'bcost');
    let affordable = true;
    Object.entries(r.cost).forEach(([item, qty], i) => {
      const have = state.me.inv[item] || 0;
      const ok = have >= qty;
      if (!ok) affordable = false;
      costEl.append(el('span', ok ? 'ok' : 'miss',
        `${i ? ' ' : ''}${qty}${COST_SHORT[item] || itemName(item)}`));
    });
    b.append(costEl);
    b.title = `${r.desc ? r.desc + '\n' : ''}Needs: `
      + Object.entries(r.cost).map(([it, q]) => `${q} ${itemName(it)}`).join(', ');
    if (!affordable) b.classList.add('short');
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

// Rendered fresh on every open so rebound keys show their real labels.
const kbd = (a) => `<span class="kbd">${labelFor(a)}</span>`;
const helpHTML = () => `
<h2>How to survive</h2>
<p>${kbd('moveLeft')}/${kbd('moveRight')} move · ${kbd('jump')} jump · <span class="kbd">click</span>/${kbd('swing')} harvest &amp; attack</p>
<p>${kbd('equip1')}–${kbd('equip4')} tool hotbar (pin tools to keys from the inventory; unpinned slots use your best tool) · ${kbd('toggleInv')} inventory &amp; crafting · ${kbd('toggleBuild')} build bar · ${kbd('eatQuick')} quick-eat</p>
<p>${kbd('interact')} interact (light campfire / open box / feed dodo) · ${kbd('cook')} cook meat · ${kbd('demolish')} demolish · ${kbd('dinoToggle')} dodo follow/stay</p>
<p>${kbd('mount')} ride a tamed parasaur · ${kbd('muteToggle')} mute sounds · ${kbd('chat')} chat · <span class="kbd">Esc</span> options/quit · ${kbd('toggleHelp')} close this help</p>
<p>Keep an eye on your <b>water bar</b> — drink from streams (${kbd('interact')} while standing in one) or eat berries.
Keys can be rebound in the options menu (<span class="kbd">Esc</span>).</p>
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
  if (!p.classList.contains('hidden')) p.innerHTML = helpHTML();
}

// --- ESC options menu -------------------------------------------------------

// Rebindable actions shown in the Controls section, in display order.
const BIND_ROWS = [
  ['moveLeft', 'Move left'], ['moveRight', 'Move right'], ['jump', 'Jump'],
  ['swing', 'Attack / harvest'], ['interact', 'Interact'],
  ['toggleBuild', 'Build menu'], ['toggleInv', 'Inventory'],
  ['cook', 'Cook meat'], ['demolish', 'Demolish'], ['eatQuick', 'Quick eat'],
  ['dinoToggle', 'Pet follow/stay'], ['mount', 'Ride mount'],
  ['equip1', 'Tool slot 1'], ['equip2', 'Tool slot 2'],
  ['equip3', 'Tool slot 3'], ['equip4', 'Tool slot 4'],
  ['chat', 'Chat'], ['muteToggle', 'Mute sounds'], ['toggleHelp', 'Help'],
];

// One live key-grab at a time; canceled if the panel rerenders or closes.
let grabCancel = null;

function bindRow(action, label) {
  const row = el('div', 'itemrow');
  row.append(el('span', 'nm', label));
  const btn = el('button', 'bindbtn', labelFor(action));
  btn.onclick = () => {
    if (grabCancel) grabCancel();
    btn.textContent = 'press a key…';
    const grab = (ev) => {
      ev.preventDefault();
      ev.stopPropagation();
      cleanup();
      if (ev.code !== 'Escape') setBind(action, ev.code); // Esc = cancel
      refreshOptions();
    };
    const cleanup = () => { window.removeEventListener('keydown', grab, true); grabCancel = null; };
    grabCancel = cleanup;
    window.addEventListener('keydown', grab, true);
  };
  row.append(btn);
  return row;
}

function settingRow(label, key, hint) {
  const row = el('div', 'itemrow');
  const cb = el('input');
  cb.type = 'checkbox';
  cb.checked = !!state.settings[key];
  cb.onchange = () => sendMsg({ t: 'setSettings', [key]: cb.checked });
  const lbl = el('span', 'nm', label);
  row.append(cb, lbl);
  if (hint) row.append(el('span', 'cost', hint));
  return row;
}

function refreshOptions() {
  // Any pending key-grab dies with the old buttons — otherwise closing the
  // panel mid-grab would leave a listener silently rebinding the next key.
  if (grabCancel) grabCancel();
  const panel = $('optionsPanel');
  if (panel.classList.contains('hidden')) return;
  panel.replaceChildren();
  panel.append(el('h2', '', 'Options'));
  panel.append(el('h3', '', 'World rules — shared by every survivor'));
  panel.append(settingRow('Hunger drain', 'hunger', 'off = food bar never drops'));
  panel.append(settingRow('Thirst drain', 'thirst', 'off = water bar never drops'));
  panel.append(settingRow('Dino damage', 'damage', 'off = wildlife can\'t hurt you'));
  panel.append(settingRow('Instant tame', 'instantTame', 'on = one feed tames (subdue-tames still need a knockout first)'));

  const dayRow = el('div', 'itemrow');
  dayRow.append(el('span', 'nm', 'Day length'));
  const sel = el('select');
  for (const [v, label] of [[240, 'Fast (4 min)'], [480, 'Normal (8 min)'], [960, 'Long (16 min)']]) {
    const o = el('option', '', label);
    o.value = v;
    if (state.settings.dayLen === v) o.selected = true;
    sel.append(o);
  }
  sel.onchange = () => sendMsg({ t: 'setSettings', dayLen: Number(sel.value) });
  dayRow.append(sel);
  panel.append(dayRow);

  const botRow = el('div', 'itemrow');
  botRow.append(el('span', 'nm', 'AI survivors'));
  const bsel = el('select');
  for (let v = 0; v <= 15; v++) {
    const o = el('option', '', v === 0 ? 'None' : String(v));
    o.value = v;
    if ((state.settings.bots ?? 0) === v) o.selected = true;
    bsel.append(o);
  }
  bsel.onchange = () => sendMsg({ t: 'setSettings', bots: Number(bsel.value) });
  botRow.append(bsel, el('span', 'cost', 'computer survivors that build and roam (up to 15)'));
  panel.append(botRow);

  panel.append(el('h3', '', 'Local'));
  const muteRow = el('div', 'itemrow');
  const mcb = el('input');
  mcb.type = 'checkbox';
  mcb.checked = localStorage.getItem('ss_mute') === '1';
  mcb.onchange = () => setMute(mcb.checked);
  muteRow.append(mcb, el('span', 'nm', 'Mute sounds (M)'));
  panel.append(muteRow);

  panel.append(el('h3', '', 'Controls — this browser'));
  panel.append(el('p', 'cost',
    'Click a key, then press the new one (Esc cancels). A key taken from another action leaves it as "—". Arrows, W, and Tab stay as built-in extras.'));
  for (const [action, label] of BIND_ROWS) panel.append(bindRow(action, label));
  const resetRow = el('div', 'itemrow');
  const resetBtn = el('button', '', 'Reset default keys');
  resetBtn.onclick = () => { resetBinds(); refreshOptions(); toast('Keys reset to defaults'); };
  resetRow.append(resetBtn);
  panel.append(resetRow);

  const btnRow = el('div', 'itemrow');
  const resume = el('button', '', 'Resume (Esc)');
  resume.onclick = () => toggleOptions();
  const quit = el('button', '', 'Quit to title');
  quit.onclick = () => location.reload();
  btnRow.append(resume, quit);
  panel.append(btnRow);
}

export function toggleOptions() {
  const p = $('optionsPanel');
  p.classList.toggle('hidden');
  refreshOptions();
}

export function isPanelOpen() {
  return ['invPanel', 'storagePanel', 'helpPanel', 'optionsPanel']
    .some((id) => !$(id).classList.contains('hidden'))
    || !$('buildBar').classList.contains('hidden');
}

export function closeAllPanels() {
  $('invPanel').classList.add('hidden');
  $('helpPanel').classList.add('hidden');
  $('optionsPanel').classList.add('hidden');
  closeStorage();
  cancelBuild();
}

// --- wiring ---------------------------------------------------------------------

export function initUI() {
  on('toast', (m) => toast(m.msg));
  on('settings', () => refreshOptions());
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
