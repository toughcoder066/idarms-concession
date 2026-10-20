import { PrismaClient } from '../../generated/prisma';
import { config } from '../config';
import { getChannel } from '../messaging/rabbit';
import { processOnce } from '../messaging/inbox';
import { recordUpstreamSync } from '../events/relay';
import type { EventEnvelope } from '../messaging/events';

const CONSUMER_ID = `${config.serviceName}.upstream`;
const QUEUE = `${config.serviceName}.upstream`;

async function runUpstreamWorker(): Promise<void> {
  const prisma = new PrismaClient();
  const channel = await getChannel();

  await channel.assertExchange(config.rabbitmqExchange, 'topic', { durable: true });
  await channel.assertQueue(QUEUE, { durable: true });

  for (const routingKey of config.consumedRoutingKeys) {
    await channel.bindQueue(QUEUE, config.rabbitmqExchange, routingKey);
  }

  await channel.consume(QUEUE, async (msg) => {
    if (!msg) return;
    try {
      const envelope = JSON.parse(msg.content.toString()) as EventEnvelope;
      await processOnce(prisma, CONSUMER_ID, envelope, async (tx, event) => {
        await recordUpstreamSync(tx, event);
      });
      channel.ack(msg);
    } catch (err) {
      console.error('[upstream] processing failed', err);
      channel.nack(msg, false, true);
    }
  }, { noAck: false });

  console.log(`[upstream] ${config.serviceName} listening on "${QUEUE}" from ${config.rabbitmqExchange}`);
}

runUpstreamWorker().catch((err) => {
  console.error('[upstream] worker crashed', err);
  process.exit(1);
});
