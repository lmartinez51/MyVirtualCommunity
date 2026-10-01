import { createWorldServer } from './server/http-server.js';
import { DEFAULT_SERVER_PORT, DEFAULT_SERVER_HOST } from './server/config.js';

const port = process.env.PORT ? parseInt(process.env.PORT, 10) : DEFAULT_SERVER_PORT;
const host = process.env.HOST || DEFAULT_SERVER_HOST;

const server = createWorldServer({ silent: false, enableRealTimeDriver: true });

async function main(): Promise<void> {
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
