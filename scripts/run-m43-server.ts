import { existsSync, unlinkSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { createWorldServer } from '../src/server/http-server.js';
import { WorldSessionController } from '../src/server/session-controller.js';

const persistencePath = join(tmpdir(), 'm43-browser-validation-state.json');
if (existsSync(persistencePath)) {
  try {
    unlinkSync(persistencePath);
    console.log(`[M43 SERVER] Cleaned up previous validation file: ${persistencePath}`);
  } catch (e) {
    console.warn(`[M43 SERVER] Could not delete previous state: ${e}`);
  }
}

const controller = new WorldSessionController({
  persistencePath,
  silent: false,
});

const server = createWorldServer({
  controller,
  silent: false,
});

server.start(3000, '127.0.0.1').then((info) => {
  console.log(`[M43 SERVER] Active and listening on ${info.url}`);
});

process.on('SIGINT', async () => {
  console.log('\n[M43 SERVER] Shutting down...');
  await server.stop();
  process.exit(0);
});

process.on('SIGTERM', async () => {
  console.log('\n[M43 SERVER] Shutting down...');
  await server.stop();
  process.exit(0);
});
