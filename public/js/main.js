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
  openStorage, closeAllPanels,
} from './ui.js';
import { initChat, focusChat } from './chat.js';
import { HARVEST_RANGE, INTERACT_RANGE, PLAYER_W, PLAYER_H } from '/shared/const.js';
import { STRUCTURES } from '/shared/structures.js';
import { DINODEFS } from '/shared/dinodefs.js';
import { interp } from './state.js';

const canvas = document.getElementById('game');
initRender(canvas);
initInput(canvas);
initUI();
initChat();

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

const EQUIP_SLOTS = { equip1: '', equip2: 'stone_axe', equip3: 'stone_pick', equip4: 'spear' };

function doSwing() {
  if (state.me.mounted || state.me.swingT > 0.05) return;
  state.me.swingT = 0.35;
  const cx = meCenter();
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

  const s = findNearestStructure(INTERACT_RANGE + 30, ['storage_box', 'campfire', 'forge']);
  const d = findNearestDino(INTERACT_RANGE + 30, (dd) => !dd.o);
  const sD = s ? Math.abs(s.x + STRUCTURES[s.kind].w / 2 - cx) : Infinity;
  const dD = d ? Math.abs(d.x - cx) : Infinity;
  if (d && dD < sD) { sendMsg({ t: 'feed', dino: d.i }); return; }
  if (!s) return;
  if (s.kind === 'storage_box') openStorage(s.id);
  else if (s.kind === 'forge') sendMsg({ t: 'use', id: s.id, action: 'smelt' });
  else sendMsg({ t: 'use', id: s.id, action: 'fuel' });
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
        if (state.build) sendMsg({ t: 'build', kind: state.build, x: screenToWorldX(mouse.x) });
        else doSwing();
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
      case 'chat': focusChat(); break;
      case 'escape':
        if (state.build) cancelBuild();
        else closeAllPanels();
        break;
      case 'equip1': case 'equip2': case 'equip3': case 'equip4':
        sendMsg({ t: 'equip', item: EQUIP_SLOTS[a.type] });
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

window.__game = { state, sendMsg, cam, screenToWorldX }; // debug/testing handle

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
