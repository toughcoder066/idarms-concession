import { PrismaClient } from '../../generated/prisma';
import { config } from '../config';
import { getChannel } from '../messaging/rabbit';
import { processOnce } from '../messaging/inbox';
import { registerEventHandlers } from '../events/handlers';
import type { EventEnvelope } from '../messaging/events';

const CONSUMER_ID = `${config.serviceName}.inbox`;

async function runInboxWorker(): Promise<void> {
  const prisma = new PrismaClient();
  const handlers = registerEventHandlers();
  const channel = await getChannel();

  await channel.assertExchange(config.rabbitmqExchange, 'topic', { durable: true });
  const queue = `${config.serviceName}.inbox`;
  await channel.assertQueue(queue, { durable: true });

  for (const routingKey of config.consumedRoutingKeys) {
    await channel.bindQueue(queue, config.rabbitmqExchange, routingKey);
  }

  await channel.consume(queue, async (msg) => {
    if (!msg) return;
    try {
      const envelope = JSON.parse(msg.content.toString()) as EventEnvelope;
      const handler = handlers.get(envelope.eventType);
      await processOnce(prisma, CONSUMER_ID, envelope, async (tx, event) => {
        if (handler) {
          return handler(tx, event);
        }
        return undefined;
      });
      channel.ack(msg);
    } catch (err) {
      console.error('[inbox] message processing failed', err);
      channel.nack(msg, false, true);
    }
  }, { noAck: false });

  console.log(`[inbox] ${config.serviceName} listening on queue "${queue}"`);
}

runInboxWorker().catch((err) => {
  console.error('[inbox] worker crashed', err);
  process.exit(1);
});
