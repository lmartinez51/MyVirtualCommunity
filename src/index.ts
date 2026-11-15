import { createWorldServer } from './server/http-server.js';
import { DEFAULT_SERVER_PORT, DEFAULT_SERVER_HOST } from './server/config.js';

const port = process.env.PORT ? parseInt(process.env.PORT, 10) : DEFAULT_SERVER_PORT;
const host = process.env.HOST || DEFAULT_SERVER_HOST;

const isPresetActiveHours =
  process.argv.includes('--preset-active-hours') || process.env.PRESET_ACTIVE_HOURS === 'true';

const server = createWorldServer({
  controllerOptions: {
    worldSeed: 'gomez-morin',
  },
  silent: false,
  enableRealTimeDriver: true,
});

async function main(): Promise<void> {
  if (isPresetActiveHours) {
    const controller = server.getController();
    // Advance world time to 16:00 UTC (corresponding to 10:00 AM local civil time in Ciudad Juárez, America/Ciudad_Juarez, UTC-6)
    // so establishments (Wing Spot, Pastelerías La Tía Lupe) are open and NPC shifts are active.
    const current = new Date(controller.getStatus().worldTime);
    const target = new Date(current);
    target.setUTCHours(16, 0, 0, 0);
    if (target.getTime() <= current.getTime()) {
      target.setUTCDate(target.getUTCDate() + 1);
    }
    const advanceDurationMs = target.getTime() - current.getTime();
    await controller.stepSimulation(advanceDurationMs);

    // If player is indoors, move outdoors for the visual slice starting point
    try {
      await controller.dispatchCommand('exitRestaurant', {});
    } catch {
      // If not in restaurant, continue
    }
    try {
      await controller.dispatchCommand('leaveBuilding', {});
    } catch {
      // If already outside, proceed
    }
    console.log('[DEV] Active-hours preset applied: world time advanced to 16:00 UTC and player positioned outdoors.');
  }

  await server.start(port, host);

  const shutdown = async (signal: string) => {
    console.log(`\nReceived ${signal}, shutting down world server...`);
    await server.stop();
    process.exit(0);
  };

  process.on('SIGINT', () => void shutdown('SIGINT'));
  process.on('SIGTERM', () => void shutdown('SIGTERM'));
}

main().catch((err) => {
  console.error('Fatal error starting World Server:', err);
  process.exit(1);
});
