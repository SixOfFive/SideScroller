// Item definitions. `food` items can be eaten; `tool` items can be equipped.

export const ITEMS = {
  wood:        { name: 'Wood' },
  thatch:      { name: 'Thatch' },
  stone:       { name: 'Stone' },
  flint:       { name: 'Flint' },
  fiber:       { name: 'Fiber' },
  hide:        { name: 'Hide' },
  berry:       { name: 'Berries',     food: { hunger: 8,  hp: 0 } },
  raw_meat:    { name: 'Raw Meat',    food: { hunger: 10, hp: -4 } },
  cooked_meat: { name: 'Cooked Meat', food: { hunger: 30, hp: 8 } },
  egg:         { name: 'Dodo Egg',    food: { hunger: 18, hp: 2 } },
  stone_axe:   { name: 'Stone Axe',   tool: 'axe' },
  stone_pick:  { name: 'Stone Pick',  tool: 'pick' },
  spear:       { name: 'Spear',       tool: 'spear' },
};

// Own-property check so ids like '__proto__' or 'constructor' never resolve
// through the prototype chain.
export function isItem(id) {
  return typeof id === 'string' && Object.prototype.hasOwnProperty.call(ITEMS, id);
}

export function itemName(id) {
  return isItem(id) ? ITEMS[id].name : String(id);
}
