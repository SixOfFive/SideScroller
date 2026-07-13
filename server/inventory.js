// Inventory helpers. An inventory is a plain object: { itemId: qty }.

export function invAdd(inv, item, qty) {
  if (qty <= 0) return;
  inv[item] = (inv[item] || 0) + qty;
}

// Removes up to qty; returns how many were actually removed.
export function invRemove(inv, item, qty) {
  const cur = inv[item] || 0;
  const n = Math.min(cur, qty);
  if (n <= 0) return 0;
  if (cur - n === 0) delete inv[item];
  else inv[item] = cur - n;
  return n;
}

export function invCount(inv, item) {
  return inv[item] || 0;
}

export function invHas(inv, cost) {
  return Object.keys(cost).every((k) => (inv[k] || 0) >= cost[k]);
}

// Deducts a full cost object if affordable; returns whether it was paid.
export function invPayCost(inv, cost) {
  if (!invHas(inv, cost)) return false;
  for (const k of Object.keys(cost)) invRemove(inv, k, cost[k]);
  return true;
}
