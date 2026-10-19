// Dev utility: publish an event envelope to the local idarms.events exchange.
// Use it to simulate the CROIP -> iDARMS downstream sync without a running bridge.
//
// Usage:
//   node scripts/dev/publish-event.mjs <eventType> '<payload-json>' [concessionId] [assemblyId]
//
// Example:
//   node scripts/dev/publish-event.mjs ratepayer.registered.v1 '{"id":"11111111-1111-1111-1111-111111111111","reference":"RT-001","fullName":"Kwame Mensah"}'

import { randomUUID } from 'node:crypto';
import { readFileSync } from 'node:fs';
import * as amqp from 'amqplib';

const RABBITMQ_URL = process.env.RABBITMQ_URL ?? 'amqp://idarms:idarms@127.0.0.1:5672';
const EXCHANGE = process.env.RABBITMQ_EXCHANGE ?? 'idarms.events';
const DEV_CONCESSION = '11111111-1111-1111-1111-111111111111';
const DEV_ASSEMBLY = '22222222-2222-2222-2222-222222222222';

const [, , eventType, payloadJson, concessionId = DEV_CONCESSION, assemblyId = DEV_ASSEMBLY] = process.argv;

if (!eventType || !payloadJson) {
  console.error('usage: node scripts/dev/publish-event.mjs <eventType> <payload-json> [concessionId] [assemblyId]');
  process.exit(1);
}

let payload;
try {
  if (payloadJson.startsWith('@')) {
    payload = JSON.parse(readFileSync(payloadJson.slice(1), 'utf8'));
  } else {
    payload = JSON.parse(payloadJson);
  }
} catch (err) {
  console.error('payload must be valid JSON (inline) or an @path to a JSON file:', err.message);
  process.exit(1);
}

const envelope = {
  id: randomUUID(),
  eventType,
  eventVersion: 1,
  producer: 'dev-publisher',
  aggregateType: 'Dev',
  aggregateId: typeof payload.id === 'string' ? payload.id : randomUUID(),
  aggregateVersion: 1,
  concessionId,
  assemblyId,
  correlationId: randomUUID(),
  occurredAt: new Date().toISOString(),
  payload,
};

const connection = await amqp.connect(RABBITMQ_URL);
const channel = await connection.createChannel();
await channel.assertExchange(EXCHANGE, 'topic', { durable: true });

channel.publish(EXCHANGE, eventType, Buffer.from(JSON.stringify(envelope)), {
  persistent: true,
  contentType: 'application/json',
  messageId: envelope.id,
});

console.log(`published ${eventType} (${envelope.id}) to ${EXCHANGE}`);

await channel.close();
await connection.close();
