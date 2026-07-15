// Tool hotbar (keys 1-4): which item each key equips. Pin any tool to a slot
// from the inventory panel; assignments persist per browser. A slot with no
// assignment (or whose item you don't currently own) falls back to the best
// tool of its family you have — so slots quietly upgrade from stone to metal.

import { ITEMS } from '/shared/items.js';
import { state } from './state.js';

// Family fallback per slot, best first. Slot 1 is bare hands by default.
const SMART = {
  1: [],
  2: ['metal_axe', 'stone_axe'],
  3: ['metal_pick', 'stone_pick'],
  4: ['rifle', 'sword', 'spear'],
};

function load() {
  const out = {};
  try {
    const raw = JSON.parse(localStorage.getItem('ss_slots') || '{}');
    for (const n of [1, 2, 3, 4]) {
      const v = raw[n];
      if (v === '' || (typeof v === 'string' && ITEMS[v] && ITEMS[v].tool)) out[n] = v;
    }
  } catch { /* corrupted store: all smart */ }
  return out;
}

let assigned = load(); // slot -> item id ('' = hands); absent = smart default

function save() {
  try { localStorage.setItem('ss_slots', JSON.stringify(assigned)); } catch {}
}

export function assignSlot(n, item) {
  // One item pins to one slot — pinning elsewhere moves it.
  for (const k of Object.keys(assigned)) if (assigned[k] === item && +k !== n) delete assigned[k];
  assigned[n] = item;
  save();
}

export function clearSlot(n) {
  delete assigned[n];
  save();
}

// The slot an item is pinned to, or null.
export function slotOf(item) {
  for (const [n, v] of Object.entries(assigned)) if (v === item) return +n;
  return null;
}

// What pressing key n equips right now.
export function slotItem(n) {
  const a = assigned[n];
  if (a !== undefined && (a === '' || (state.me.inv[a] || 0) > 0)) return a;
  for (const id of SMART[n] || []) if ((state.me.inv[id] || 0) > 0) return id;
  return '';
}
