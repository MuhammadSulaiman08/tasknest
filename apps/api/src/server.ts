import { createApp } from './app.js';
import { config } from './config.js';
import { pool } from './db/index.js';
import { logger } from './lib/logger.js';

const server = createApp().listen(config.PORT, () => logger.info(`API listening on http://localhost:${config.PORT}`));

for (const signal of ['SIGINT', 'SIGTERM'] as const) {
  process.on(signal, () => {
    server.close(async () => {
      await pool.end();
      process.exit(0);
    });
  });
}
