import { PrismaClient } from '../../generated/prisma';
import { config } from '../config';
import { publishDueOutbox } from '../messaging/outbox';

const POLL_INTERVAL_MS = 1000;

async function runOutboxWorker(): Promise<void> {
  const prisma = new PrismaClient();
  console.log(`[outbox] ${config.serviceName} publisher started`);

  while (true) {
    try {
      // The bridge publishes to two exchanges: local events go to idarms.events
      // and national events (croip.*) go to the croip.events exchange.
      const published = await publishDueOutbox(prisma, 100, (routingKey) => {
        return routingKey.startsWith('croip.') ? config.croipExchange : config.rabbitmqExchange;
      });
      if (published > 0) {
        console.log(`[outbox] published ${published} event(s)`);
      }
    } catch (err) {
      console.error('[outbox] publish cycle failed', err);
    }
    await new Promise((resolve) => setTimeout(resolve, POLL_INTERVAL_MS));
  }
}

runOutboxWorker().catch((err) => {
  console.error('[outbox] worker crashed', err);
  process.exit(1);
});
