// Temp live-server check: join as a headless client, flip llmBots on, let the
// three live bots plan against the real endpoint for ~50s, flip it back off.
import WebSocket from 'ws';

const ws = new WebSocket('ws://localhost:3000');
let sawSettings = false;

ws.on('open', () => {
  ws.send(JSON.stringify({ t: 'join', name: 'LlmTester', token: 'llm-test-token' }));
  setTimeout(() => {
    console.log('toggling llmBots ON');
    ws.send(JSON.stringify({ t: 'setSettings', llmBots: true }));
  }, 500);
  setTimeout(() => {
    console.log('toggling llmBots OFF (restore default)');
    ws.send(JSON.stringify({ t: 'setSettings', llmBots: false }));
  }, 50000);
  setTimeout(() => { ws.close(); process.exit(0); }, 52000);
});

ws.on('message', (buf) => {
  let m; try { m = JSON.parse(buf); } catch { return; }
  if (m.t === 'settings') { sawSettings = true; console.log('settings ack:', JSON.stringify(m.settings)); }
  if (m.t === 'chat' && m.from) console.log(`chat <${m.from}> ${m.text}`);
});

ws.on('error', (e) => { console.error('ws error:', e.message); process.exit(1); });
