// Keyboard/mouse capture. Movement keys are polled (held); everything else is
// queued as an action for main.js to dispatch.

export const held = { left: false, right: false, jump: false };
export const mouse = { x: 0, y: 0 };

const queue = [];
export function popActions() { return queue.splice(0); }
const act = (type, data) => queue.push({ type, ...data });

function typingInField() {
  const el = document.activeElement;
  return el && (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA');
}

const KEY_ACTIONS = {
  KeyF: 'swing',
  KeyE: 'interact',
  KeyC: 'cook',
  KeyX: 'demolish',
  KeyG: 'eatQuick',
  KeyQ: 'toggleBuild',
  KeyI: 'toggleInv',
  Tab: 'toggleInv',
  KeyH: 'toggleHelp',
  KeyT: 'dinoToggle',
  KeyR: 'mount',
  KeyM: 'muteToggle',
  Enter: 'chat',
  Escape: 'escape',
  Digit1: 'equip1',
  Digit2: 'equip2',
  Digit3: 'equip3',
  Digit4: 'equip4',
};

export function initInput(canvas) {
  window.addEventListener('keydown', (ev) => {
    if (typingInField()) {
      if (ev.code === 'Escape') act('escape');
      return;
    }
    switch (ev.code) {
      case 'KeyA': case 'ArrowLeft': held.left = true; ev.preventDefault(); return;
      case 'KeyD': case 'ArrowRight': held.right = true; ev.preventDefault(); return;
      case 'KeyW': case 'ArrowUp': case 'Space': held.jump = true; ev.preventDefault(); return;
    }
    const a = KEY_ACTIONS[ev.code];
    if (a && !ev.repeat) {
      act(a);
      ev.preventDefault();
    }
  });

  window.addEventListener('keyup', (ev) => {
    switch (ev.code) {
      case 'KeyA': case 'ArrowLeft': held.left = false; break;
      case 'KeyD': case 'ArrowRight': held.right = false; break;
      case 'KeyW': case 'ArrowUp': case 'Space': held.jump = false; break;
    }
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
