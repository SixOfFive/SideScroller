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

// A per-browser secret proves ownership of the survivor name across sessions.
function identityToken() {
  let token = localStorage.getItem('ss_token');
  if (!token) {
    token = crypto.randomUUID ? crypto.randomUUID()
      : `${Date.now()}-${Math.random().toString(36).slice(2)}${Math.random().toString(36).slice(2)}`;
    localStorage.setItem('ss_token', token);
  }
  return token;
}

export function connect(name) {
  if (ws && ws.readyState <= 1) return; // already connecting or connected
  const proto = location.protocol === 'https:' ? 'wss:' : 'ws:';
  const sock = new WebSocket(`${proto}//${location.host}`);
  ws = sock;
  sock.onopen = () => {
    if (sock.readyState === 1) sock.send(JSON.stringify({ t: 'join', name, token: identityToken() }));
  };
  sock.onmessage = (ev) => {
    let msg;
    try { msg = JSON.parse(ev.data); } catch { return; }
    if (msg && typeof msg.t === 'string') emit(msg);
  };
  sock.onclose = () => { if (ws === sock) emit({ t: 'disconnect' }); };
}
