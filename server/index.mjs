import { buildApp } from './app.mjs';

const parsedPort = Number.parseInt(process.env.PORT ?? '3001', 10);
const port = Number.isInteger(parsedPort) && parsedPort > 0 && parsedPort <= 65_535 ? parsedPort : 3001;
// The API has deliberately local, single-user semantics and no authentication.
// Keep it loopback-only unless the operator explicitly opts into LAN exposure.
const host = process.env.HOST ?? '127.0.0.1';

const app = await buildApp({ logger: true });

const shutdown = async (signal) => {
  app.log.info({ signal }, 'Shutting down');
  await app.close();
  process.exit(0);
};

process.once('SIGINT', () => void shutdown('SIGINT'));
process.once('SIGTERM', () => void shutdown('SIGTERM'));

try {
  await app.listen({ port, host });
} catch (error) {
  app.log.error(error);
  process.exit(1);
}
