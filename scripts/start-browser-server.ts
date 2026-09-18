import { createWorldServer } from '../src/server/http-server.js';
import { WorldSessionController } from '../src/server/session-controller.js';
import { join } from 'node:path';
import { tmpdir } from 'node:os';

const tempFilePath = join(tmpdir(), `browser-verification-${Date.now()}.json`);
const controller = new WorldSessionController({
  persistencePath: tempFilePath,
  silent: false,
});

// Advance time to 10:00 UTC so restaurant and NPC shift are open and active
const current = new Date(controller.getStatus().worldTime);
const target = new Date(current);
target.setUTCHours(10, 0, 0, 0);
if (target.getTime() <= current.getTime()) {
  target.setUTCDate(target.getUTCDate() + 1);
}
const advanceDurationMs = target.getTime() - current.getTime();
await controller.stepSimulation(advanceDurationMs);

const server = createWorldServer({ controller, silent: false });
const info = await server.start(3000, '127.0.0.1');
console.log(`[VERIFICATION SERVER] Active and listening on: ${info.url}`);

process.on('SIGTERM', async () => {
  await server.stop();
  process.exit(0);
});
