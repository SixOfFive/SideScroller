// Keyboard/mouse capture. Movement keys are polled (held); everything else is
// queued as an action for main.js to dispatch.
//
// Bindings are per-browser (localStorage 'ss_binds') and editable from the
// ESC options menu. Escape itself is fixed — you can never rebind away your
// way back to the menu. Arrows / W / Tab remain built-in extras for movement,
// jump, and inventory, but only while no custom bind claims those keys.

export const held = { left: false, right: false, jump: false };
export const mouse = { x: 0, y: 0 };

const queue = [];
export function popActions() { return queue.splice(0); }
const act = (type, data) => queue.push({ type, ...data });

function typingInField() {
  const el = document.activeElement;
  return el && (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA');
}

// action -> default physical key (KeyboardEvent.code, layout-independent)
export const DEFAULT_BINDS = {
  moveLeft: 'KeyA', moveRight: 'KeyD', jump: 'Space',
  swing: 'KeyF', interact: 'KeyE', cook: 'KeyC', demolish: 'KeyX',
  eatQuick: 'KeyG', toggleBuild: 'KeyQ', toggleInv: 'KeyI',
  toggleHelp: 'KeyH', dinoToggle: 'KeyT', mount: 'KeyR',
  muteToggle: 'KeyM', chat: 'Enter',
  equip1: 'Digit1', equip2: 'Digit2', equip3: 'Digit3', equip4: 'Digit4',
};

// Built-in extras, active only while their key isn't claimed by a custom bind.
const FALLBACKS = {
  ArrowLeft: 'moveLeft', ArrowRight: 'moveRight',
  ArrowUp: 'jump', KeyW: 'jump', Tab: 'toggleInv',
};

// Actions polled as held flags rather than queued.
const HELD_ACTIONS = { moveLeft: 'left', moveRight: 'right', jump: 'jump' };

function loadBinds() {
  const out = { ...DEFAULT_BINDS };
  try {
    const saved = JSON.parse(localStorage.getItem('ss_binds') || '{}');
    for (const [a, c] of Object.entries(saved)) {
      if (a in out && typeof c === 'string' && c !== 'Escape') out[a] = c;
    }
  } catch { /* corrupted store: fall back to defaults */ }
  return out;
}

let binds = loadBinds();
let codeMap = {}; // physical key code -> action
rebuildCodeMap();

function rebuildCodeMap() {
  codeMap = {};
  for (const [a, c] of Object.entries(binds)) if (c) codeMap[c] = a;
  for (const [c, a] of Object.entries(FALLBACKS)) if (!codeMap[c]) codeMap[c] = a;
}

function saveBinds() {
  try { localStorage.setItem('ss_binds', JSON.stringify(binds)); } catch {}
}

export function getBinds() { return { ...binds }; }

// Bind a key to an action. Whatever action held that key before loses it
// (shown as '—' until rebound) — one key, one action, no surprises.
export function setBind(action, code) {
  if (!(action in DEFAULT_BINDS) || typeof code !== 'string' || code === 'Escape') return false;
  for (const a of Object.keys(binds)) if (binds[a] === code) binds[a] = '';
  binds[action] = code;
  saveBinds();
  rebuildCodeMap();
  return true;
}

export function resetBinds() {
  binds = { ...DEFAULT_BINDS };
  saveBinds();
  rebuildCodeMap();
}

// Pretty label for a KeyboardEvent.code ('KeyQ' -> 'Q', 'ArrowLeft' -> '←').
export function keyLabel(code) {
  if (!code) return '—';
  if (code.startsWith('Key')) return code.slice(3);
  if (code.startsWith('Digit')) return code.slice(5);
  if (code.startsWith('Numpad')) return 'Num' + code.slice(6);
  if (code.startsWith('Arrow')) {
    return { Left: '←', Right: '→', Up: '↑', Down: '↓' }[code.slice(5)] || code;
  }
  return {
    Space: 'Space', Enter: 'Enter', Backspace: 'Bksp', CapsLock: 'Caps',
    ShiftLeft: 'LShift', ShiftRight: 'RShift',
    ControlLeft: 'LCtrl', ControlRight: 'RCtrl',
    AltLeft: 'LAlt', AltRight: 'RAlt',
    Semicolon: ';', Quote: "'", Comma: ',', Period: '.', Slash: '/',
    Backslash: '\\', BracketLeft: '[', BracketRight: ']',
    Minus: '-', Equal: '=', Backquote: '`',
  }[code] || code;
}

export function labelFor(action) { return keyLabel(binds[action]); }

export function initInput(canvas) {
  window.addEventListener('keydown', (ev) => {
    if (typingInField()) {
      if (ev.code === 'Escape') act('escape');
      return;
    }
    if (ev.code === 'Escape') { // fixed: always the menu/cancel key
      if (!ev.repeat) act('escape');
      ev.preventDefault();
      return;
    }
    const a = codeMap[ev.code];
    if (!a) return;
    const flag = HELD_ACTIONS[a];
    if (flag) { held[flag] = true; ev.preventDefault(); return; }
    if (!ev.repeat) {
      act(a);
      ev.preventDefault();
    }
  });

  window.addEventListener('keyup', (ev) => {
    const a = codeMap[ev.code];
    const flag = a && HELD_ACTIONS[a];
    if (flag) held[flag] = false;
  });

  window.addEventListener('blur', () => {
    held.left = held.right = held.jump = false;
  });

  canvas.addEventListener('mousemove', (ev) => {
    mouse.x = ev.clientX;
    mouse.y = ev.clientY;
  });
  canvas.addEventListener('mousedown', (ev) => {
    if (ev.button === 0) act('click');
    if (ev.button === 2) act('escape');
  });
  canvas.addEventListener('contextmenu', (ev) => ev.preventDefault());
}
