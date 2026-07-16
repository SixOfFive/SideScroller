// Entry point: join screen, the frame loop, and action dispatch.

import { connect, on, sendMsg } from './net.js';
import {
  state, findNearestNode, findNearestStructure, findNearestDino, meCenter,
} from './state.js';
import { initInput, held, mouse, popActions } from './input.js';
import { stepLocal } from './physics.js';
import { cam, screenToWorldX } from './camera.js';
import { initRender, render } from './render.js';
import {
  initUI, toast, toggleInv, toggleHelp, toggleBuildBar, cancelBuild,
  openStorage, closeAllPanels, toggleOptions, isPanelOpen,
} from './ui.js';
import { initChat, focusChat } from './chat.js';
import { initSound, toggleMute, sfx, soundTick } from './sound.js';
import { slotItem } from './slots.js';
import { HARVEST_RANGE, INTERACT_RANGE, PLAYER_W, PLAYER_H, BUILD_REACH } from '/shared/const.js';
import { STRUCTURES } from '/shared/structures.js';
import { magneticPlacement } from '/shared/place.js';
import { DINODEFS } from '/shared/dinodefs.js';
import { ITEMS } from '/shared/items.js';
import { interp } from './state.js';

const canvas = document.getElementById('game');
initRender(canvas);
initInput(canvas);
initUI();
initChat();
initSound();

// --- join screen -------------------------------------------------------------

const joinEl = document.getElementById('join');
const nameInput = document.getElementById('nameInput');
const joinBtn = document.getElementById('joinBtn');
nameInput.value = localStorage.getItem('ss_name') || '';
nameInput.focus();

function tryJoin() {
  if (joinBtn.disabled) return; // a join attempt is already in flight
  const name = nameInput.value.trim();
  if (!name) return;
  localStorage.setItem('ss_name', name);
  joinBtn.disabled = true;
  document.getElementById('joinErr').textContent = '';
  connect(name);
}
joinBtn.addEventListener('click', tryJoin);
nameInput.addEventListener('keydown', (ev) => {
  if (ev.code === 'Enter') tryJoin();
  ev.stopPropagation();
});
on('joinErr', (m) => {
  document.getElementById('joinErr').textContent = m.msg;
  joinBtn.disabled = false;
});
on('welcome', () => joinEl.classList.add('hidden'));

// --- actions -------------------------------------------------------------------

function doSwing() {
  if (state.me.mounted || state.me.swingT > 0.05) return;
  const cx = meCenter();
  const equipped = ITEMS[state.me.equip];
  if (equipped && equipped.tool === 'gun') {
    // 700 to the dino's left edge keeps its CENTER under the server's 780 range
    // even for a rex (w≈156), so a fired shot never bounces on the server.
    const dino = findNearestDino(700, (d) => !d.o);
    if (!dino) { toast('No target in range'); return; } // don't waste bullets on air
    state.me.swingT = 0.2;
    state.me.face = Math.sign(dino.x + (DINODEFS[dino.sp]?.w || 40) / 2 - cx) || state.me.face;
    sendMsg({ t: 'shoot', dino: dino.i });
    return;
  }
  state.me.swingT = 0.35;
  sfx('swing');
  const node = findNearestNode(HARVEST_RANGE + 40);
  // wide detection so big dinos (rex) register; the server range-checks by size
  const dino = findNearestDino(HARVEST_RANGE + 120, (d) => !d.o);
  const nodeD = node ? Math.abs(node.x - cx) : Infinity;
  const dinoD = dino ? Math.abs(dino.x + (DINODEFS[dino.sp]?.w || 40) / 2 - cx) : Infinity;
  if (dino && dinoD <= nodeD) sendMsg({ t: 'attack', dino: dino.i });
  else if (node) sendMsg({ t: 'harvest', node: node.id });
}

function toggleMount() {
  if (state.me.mounted) { sendMsg({ t: 'dinoCmd', dino: state.me.mountId, cmd: 'dismount' }); return; }
  const d = findNearestDino(INTERACT_RANGE + 90, (dd) => dd.o === state.name && DINODEFS[dd.sp]?.rideable);
  if (d) sendMsg({ t: 'dinoCmd', dino: d.i, cmd: 'mount' });
  else toast('No mount of yours nearby');
}

function doInteract() {
  const cx = meCenter();
  // portals take priority when you're standing in one
  const portal = findNearestStructure(INTERACT_RANGE, ['portal']);
  if (portal) { sendMsg({ t: 'use', id: portal.id, action: 'enter' }); return; }
  // standing in a stream: drink
  if (state.me.inWater) { sendMsg({ t: 'drink' }); return; }

  const s = findNearestStructure(INTERACT_RANGE + 30, ['storage_box', 'campfire', 'forge']);
  // Only tameable dinos claim E — and a subdue-tame carnivore only once it's
  // knocked out, so a rampaging raptor never blocks your box.
  const d = findNearestDino(INTERACT_RANGE + 30, (dd) => {
    const def = DINODEFS[dd.sp];
    if (dd.o || !def || !def.tame) return false;
    return def.tame.method === 'subdue' ? !!dd.kd : true;
  });
  const sD = s ? Math.abs(s.x + STRUCTURES[s.kind].w / 2 - cx) : Infinity;
  const dD = d ? Math.abs(d.x - cx) : Infinity;
  if (d && dD < sD) { sendMsg({ t: 'feed', dino: d.i }); return; }
  if (s) {
    if (s.kind === 'storage_box') openStorage(s.id);
    else if (s.kind === 'forge') sendMsg({ t: 'use', id: s.id, action: 'smelt' });
    else sendMsg({ t: 'use', id: s.id, action: 'fuel' });
    return;
  }
  // Your own bronto's walking stash (kept after boxes/wild dinos so it never
  // hijacks feeding a dino or opening a box). Center-based reach to match the
  // server — the bronto is 244px wide, so an edge-based check leaves its far
  // half unreachable.
  let bronto = null, bbd = Infinity;
  for (const dd of state.dinos.values()) {
    const def = DINODEFS[dd.sp];
    if (dd.o !== state.name || !def || !def.stash) continue;
    const dist = Math.abs(interp(dd).x + def.w / 2 - cx);
    if (dist <= INTERACT_RANGE + def.w / 2 && dist < bbd) { bbd = dist; bronto = dd; }
  }
  if (bronto) { sendMsg({ t: 'brontoStash', dino: bronto.i, action: 'open' }); return; }
  // Nothing to interact with here — but if a wild subdue-tame (trike/carno/…)
  // is right next to you, it looks feedable, so tell the player how: knock it
  // out first (E on a not-yet-KO'd one used to do nothing at all).
  const ko = findNearestDino(INTERACT_RANGE + 30, (dd) => {
    const def = DINODEFS[dd.sp];
    return !dd.o && def && def.tame && def.tame.method === 'subdue' && !dd.kd;
  });
  if (ko) {
    const nm = DINODEFS[ko.sp].name;
    const food = DINODEFS[ko.sp].tame.food === 'berry' ? 'berries' : 'raw meat';
    toast(`Knock the ${nm} out first (attack it — don't kill it), then feed it ${food}`);
  }
}

function nearestOwnStructure() {
  const cx = meCenter();
  let best = null, bestD = INTERACT_RANGE + 50;
  for (const s of state.structures.values()) {
    if (s.owner !== state.name) continue;
    const d = Math.abs(s.x + STRUCTURES[s.kind].w / 2 - cx);
    if (d < bestD) { bestD = d; best = s; }
  }
  return best;
}

function eatQuick() {
  for (const item of ['berry', 'egg', 'cooked_meat', 'raw_meat']) {
    if ((state.me.inv[item] || 0) > 0) { sendMsg({ t: 'eat', item }); return; }
  }
  toast('Nothing edible — harvest a berry bush');
}

function processActions() {
  for (const a of popActions()) {
    switch (a.type) {
      case 'click':
        if (state.build) {
          // Mirror the server's checks locally: magnet to a clear spot, refuse
          // out-of-reach placements with the same message the ghost shows.
          const res = magneticPlacement(state.build, screenToWorldX(mouse.x), state.structures.values());
          const def = STRUCTURES[state.build];
          if (!res.ok) { toast(res.reason || 'Blocked'); break; }
          if (Math.abs(res.x + def.w / 2 - meCenter()) > BUILD_REACH) { toast('Too far — walk closer'); break; }
          // Grid pieces: send res.x raw (colOf(x) picks the column — a center
          // offset would shift it a column). Free pieces: send the center.
          sendMsg({ t: 'build', kind: state.build, x: def.grid ? res.x : res.x + def.w / 2 });
        } else doSwing();
        break;
      case 'swing': doSwing(); break;
      case 'interact': doInteract(); break;
      case 'cook': {
        const fire = findNearestStructure(INTERACT_RANGE + 30, ['campfire']);
        if (fire) sendMsg({ t: 'use', id: fire.id, action: 'cook' });
        else toast('No campfire nearby');
        break;
      }
      case 'demolish': {
        const s = nearestOwnStructure();
        if (s) sendMsg({ t: 'demolish', id: s.id });
        else toast('No structure of yours nearby');
        break;
      }
      case 'eatQuick': eatQuick(); break;
      case 'toggleBuild': toggleBuildBar(); break;
      case 'toggleInv': toggleInv(); break;
      case 'toggleHelp': toggleHelp(); break;
      case 'dinoToggle': {
        const d = findNearestDino(260, (dd) => dd.o === state.name);
        if (d) sendMsg({ t: 'dinoCmd', dino: d.i, cmd: d.s === 'stay' ? 'follow' : 'stay' });
        break;
      }
      case 'mount': toggleMount(); break;
      case 'muteToggle': toast(toggleMute() ? 'Sounds muted (M)' : 'Sounds on'); break;
      case 'chat': focusChat(); break;
      case 'escape':
        if (state.build) cancelBuild();
        else if (isPanelOpen()) closeAllPanels();
        else toggleOptions(); // nothing open: ESC is the pause/options menu
        break;
      case 'equip1': case 'equip2': case 'equip3': case 'equip4':
        // Slots resolve through slots.js: pinned item if owned, else the
        // best of the slot's family ('' = bare hands).
        sendMsg({ t: 'equip', item: slotItem(Number(a.type.slice(5))) });
        break;
    }
  }
}

// --- frame loop ------------------------------------------------------------------

function updateHover() {
  const wx = screenToWorldX(mouse.x);
  let best = null, bestD = 70;
  for (const n of state.nodes.values()) {
    if (n.dep) continue;
    const d = Math.abs(n.x - wx);
    if (d < bestD) { bestD = d; best = n; }
  }
  state.hoverNode = best;
}

// debug/testing handle. pump() forces a few sim+render frames (useful when the
// tab is backgrounded and rAF is throttled); snap() returns a downscaled JPEG
// data URL of the current frame for capturing screenshots.
window.__game = {
  state, sendMsg, cam, screenToWorldX,
  pump(n = 3) {
    for (let i = 0; i < n; i++) {
      if (state.me.mounted) rideAlong(); else stepLocal(state.me, 1 / 60, held);
      soundTick(); // keep headless frames honest — same order as frame()
      processActions();
      render(1 / 60);
    }
  },
  snap(w = 1024, h = 576, q = 0.86) {
    const c = document.createElement('canvas');
    c.width = w; c.height = h;
    c.getContext('2d').drawImage(canvas, 0, 0, w, h);
    return c.toDataURL('image/jpeg', q);
  },
};

// While mounted, the server owns the rider's position (seated on the dino);
// the client just tracks the dino's interpolated position.
function rideAlong() {
  const d = state.dinos.get(state.me.mountId);
  if (!d) return;
  const def = DINODEFS[d.sp];
  const pos = interp(d);
  state.me.x = pos.x + (def.w - PLAYER_W) / 2;
  state.me.y = pos.y - PLAYER_H + 18;
  state.me.vx = 0; state.me.vy = 0;
  state.me.face = d.f;
  state.me.anim = 'idle';
}

let last = performance.now();
function frame(now) {
  const dt = Math.min((now - last) / 1000, 0.05);
  last = now;
  if (state.joined) {
    if (state.me.mounted) rideAlong();
    else stepLocal(state.me, dt, held);
    soundTick();
    processActions();
    updateHover();
    render(dt);
  } else {
    popActions(); // don't let pre-join/post-disconnect keypresses replay later
  }
  requestAnimationFrame(frame);
}
requestAnimationFrame(frame);

setInterval(() => {
  if (!state.joined) return;
  if (state.me.mounted) {
    sendMsg({
      t: 'input',
      ride: (held.right ? 1 : 0) - (held.left ? 1 : 0),
      rj: held.jump ? 1 : 0,
    });
    return;
  }
  sendMsg({
    t: 'input',
    x: Math.round(state.me.x * 10) / 10,
    y: Math.round(state.me.y * 10) / 10,
    vx: Math.round(state.me.vx),
    f: state.me.face,
    a: state.me.anim,
  });
}, 66);
