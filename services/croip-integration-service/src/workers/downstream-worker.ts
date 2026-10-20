import { PrismaClient } from '../../generated/prisma';
import { config } from '../config';
import { getChannel } from '../messaging/rabbit';
import { processOnce } from '../messaging/inbox';
import { recordDownstreamSync } from '../events/relay';
import type { EventEnvelope } from '../messaging/events';

const CONSUMER_ID = `${config.serviceName}.downstream`;
const QUEUE = `${config.serviceName}.downstream`;

async function runDownstreamWorker(): Promise<void> {
  const prisma = new PrismaClient();
  const channel = await getChannel();

  await channel.assertExchange(config.croipExchange, 'topic', { durable: true });
  await channel.assertQueue(QUEUE, { durable: true });

  for (const routingKey of config.croipConsumedRoutingKeys) {
    await channel.bindQueue(QUEUE, config.croipExchange, routingKey);
  }

  await channel.consume(QUEUE, async (msg) => {
    if (!msg) return;
    try {
      const envelope = JSON.parse(msg.content.toString()) as EventEnvelope;

      if (envelope.concessionId !== config.concessionId) {
        // Not for this concession terminal: drop without processing.
        channel.ack(msg);
        return;
      }

      await processOnce(prisma, CONSUMER_ID, envelope, async (tx, event) => {
        await recordDownstreamSync(tx, event);
      });
      channel.ack(msg);
    } catch (err) {
      console.error('[downstream] processing failed', err);
      channel.nack(msg, false, true);
    }
  }, { noAck: false });

  console.log(`[downstream] ${config.serviceName} listening on "${QUEUE}" from ${config.croipExchange}`);
}

runDownstreamWorker().catch((err) => {
  console.error('[downstream] worker crashed', err);
  process.exit(1);
});
