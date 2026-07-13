import { createServer } from 'node:http';
import { networkInterfaces } from 'node:os';
import { PORT, SAVE_INTERVAL_MS, WORLD_SEED } from './config.js';
import { serveStatic } from './static.js';
import { initNet } from './net.js';
import { route } from './handlers.js';
import { loadWorld, saveWorld } from './state.js';
import { generateWorld } from './worldgen.js';
import { startTick } from './tick.js';

if (loadWorld()) {
  console.log('loaded saved world');
} else {
  generateWorld(WORLD_SEED);
}

const server = createServer(serveStatic);
initNet(server, route);
startTick();

setInterval(saveWorld, SAVE_INTERVAL_MS);
process.on('SIGINT', () => {
  console.log('saving world...');
  saveWorld();
  process.exit(0);
});

server.listen(PORT, '0.0.0.0', () => {
  console.log('SideScroller server running:');
  console.log(`  http://localhost:${PORT}`);
  for (const addrs of Object.values(networkInterfaces())) {
    for (const a of addrs || []) {
      if (a.family === 'IPv4' && !a.internal) console.log(`  http://${a.address}:${PORT}  (LAN)`);
    }
  }
});
