import { createServer } from 'node:http';
import { createApp } from './app.js';
import { config } from './config.js';
import { pool } from './db/index.js';
import { logger } from './lib/logger.js';
import { runDueSoonJob } from './modules/notifications/notifications.service.js';
import { attachSocketServer } from './realtime/socket.js';

const httpServer = createServer(createApp());
const io = attachSocketServer(httpServer);
httpServer.listen(config.PORT, () => logger.info(`API listening on http://localhost:${config.PORT}`));

// Background job: "due soon" notifications, every 15 minutes (and once at startup)
const runJob = () => runDueSoonJob().catch((err) => logger.error({ err }, 'due-soon job failed'));
const timer = setInterval(runJob, 15 * 60_000);
setTimeout(runJob, 5_000);

for (const signal of ['SIGINT', 'SIGTERM'] as const) {
  process.on(signal, () => {
    clearInterval(timer);
    io.close();
    httpServer.close(async () => {
      await pool.end();
      process.exit(0);
    });
  });
}
