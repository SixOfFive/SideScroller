// WebSocket client with a tiny pub/sub dispatch.

const listeners = {};
let ws = null;

export function on(type, fn) {
  (listeners[type] ??= []).push(fn);
}

function emit(msg) {
  const fns = listeners[msg.t];
  if (fns) for (const fn of fns) fn(msg);
}

export function sendMsg(obj) {
  if (ws && ws.readyState === 1) ws.send(JSON.stringify(obj));
}

export function connect(name) {
  const proto = location.protocol === 'https:' ? 'wss:' : 'ws:';
  ws = new WebSocket(`${proto}//${location.host}`);
  ws.onopen = () => sendMsg({ t: 'join', name });
  ws.onmessage = (ev) => {
    let msg;
    try { msg = JSON.parse(ev.data); } catch { return; }
    if (msg && typeof msg.t === 'string') emit(msg);
  };
  ws.onclose = () => emit({ t: 'disconnect' });
}
