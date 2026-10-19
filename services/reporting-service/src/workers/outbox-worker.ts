import { PrismaClient } from '../../generated/prisma';
import { config } from '../config';
import { publishDueOutbox } from '../messaging/outbox';

const POLL_INTERVAL_MS = 1000;

async function runOutboxWorker(): Promise<void> {
  const prisma = new PrismaClient();
  console.log(`[outbox] ${config.serviceName} publisher started`);

  while (true) {
    try {
      const published = await publishDueOutbox(prisma);
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
