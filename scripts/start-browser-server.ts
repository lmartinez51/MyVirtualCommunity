import { createWorldServer } from '../src/server/http-server.js';
import { WorldSessionController } from '../src/server/session-controller.js';
import { join } from 'node:path';
import { tmpdir } from 'node:os';

const tempFilePath = join(tmpdir(), `browser-verification-${Date.now()}.json`);
const controller = new WorldSessionController({
  persistencePath: tempFilePath,
  worldSeed: 'gomez-morin',
  initialWorldTime: '2026-09-14T16:00:00.000Z',
  silent: false,
});

// Advance world time to 16:00 UTC (corresponding to 10:00 AM local civil time in Ciudad Juárez, America/Ciudad_Juarez, UTC-6)
// so the development restaurant is open [08:00, 22:00) and the NPC shift is active [09:00, 17:00).
const current = new Date(controller.getStatus().worldTime);
const target = new Date(current);
target.setUTCHours(16, 0, 0, 0);
if (target.getTime() <= current.getTime()) {
  target.setUTCDate(target.getUTCDate() + 1);
}
const advanceDurationMs = target.getTime() - current.getTime();
await controller.stepSimulation(advanceDurationMs);

// Move player to Development Street for the visual slice starting point
try {
  await controller.dispatchCommand('leaveBuilding', {});
} catch {
  // If already outside, proceed
}

const server = createWorldServer({ controller, silent: false });
const info = await server.start(3000, '127.0.0.1');
console.log(`[VERIFICATION SERVER] Active and listening on: ${info.url}`);

process.on('SIGTERM', async () => {
  await server.stop();
  process.exit(0);
});
