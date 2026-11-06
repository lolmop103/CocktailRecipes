import { createApp } from './app.js';
import { env } from './config/env.js';
import { db } from './data/connection.js';
import { logger } from './lib/logger.js';
import { applyServerTimeouts } from './lib/serverTimeouts.js';
import { installShutdown } from './lib/shutdown.js';

const app = createApp();

const server = app.listen(env.PORT, () => {
  logger.info('Server listening', { port: env.PORT, nodeEnv: env.NODE_ENV });
});

applyServerTimeouts(server);

installShutdown(server, { closeDb: () => db.close() });
