// End-to-end smoke test for the running iDARMS stack (run `pnpm dev:all` first).
// Usage: pnpm smoke
import { randomUUID } from 'node:crypto';
import * as amqp from 'amqplib';

const CONCESSION_ID = '11111111-1111-1111-1111-111111111111';
const ASSEMBLY_ID = '22222222-2222-2222-2222-222222222222';
const RABBITMQ_URL = process.env.RABBITMQ_URL ?? 'amqp://idarms:idarms@127.0.0.1:5672';
const CROIP_EXCHANGE = 'croip.events';
const API = {
  ratepayer: 'http://127.0.0.1:3020',
  property: 'http://127.0.0.1:3010',
  billing: 'http://127.0.0.1:3030',
  payment: 'http://127.0.0.1:3040',
  documents: 'http://127.0.0.1:3050',
  valuation: 'http://127.0.0.1:3060',
  reconciliation: 'http://127.0.0.1:3070',
  reporting: 'http://127.0.0.1:3080',
  integration: 'http://127.0.0.1:3090',
  concessions: 'http://127.0.0.1:3100',
  gis: 'http://127.0.0.1:3110',
  portal: 'http://127.0.0.1:3000',
};

const tenantHeaders = {
  'x-idarms-concession-id': CONCESSION_ID,
  'x-idarms-assembly-id': ASSEMBLY_ID,
  'x-idarms-actor-id': '99999999-9999-9999-9999-999999999999',
};

let failures = 0;

function pass(label, detail = '') {
  console.log(`  PASS  ${label}${detail ? ` — ${detail}` : ''}`);
}

function fail(label, detail = '') {
  failures += 1;
  console.log(`  FAIL  ${label}${detail ? ` — ${detail}` : ''}`);
}

async function request(url, options = {}) {
  const res = await fetch(url, {
    ...options,
    headers: { accept: 'application/json', ...tenantHeaders, ...(options.headers ?? {}) },
    signal: AbortSignal.timeout(10000),
  });
  const text = await res.text();
  let body;
  try {
    body = text ? JSON.parse(text) : null;
  } catch {
    body = text;
  }
  return { status: res.status, body };
}

async function poll(label, fn, timeoutMs = 20000) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const result = await fn();
    if (result) return result;
    await new Promise((resolve) => setTimeout(resolve, 700));
  }
  throw new Error(`${label} timed out after ${timeoutMs}ms`);
}

async function publish(connection, eventType, payload) {
  const channel = await connection.createChannel();
  await channel.assertExchange(CROIP_EXCHANGE, 'topic', { durable: true });

  const head = eventType.replace(/^croip\./, '').split('.')[0];
  const envelope = {
    id: randomUUID(),
    eventType,
    eventVersion: 1,
    producer: 'smoke-test',
    aggregateType: head.charAt(0).toUpperCase() + head.slice(1),
    aggregateId: payload.id,
    aggregateVersion: 1,
    concessionId: CONCESSION_ID,
    assemblyId: ASSEMBLY_ID,
    correlationId: randomUUID(),
    occurredAt: new Date().toISOString(),
    payload,
  };

  channel.publish(CROIP_EXCHANGE, eventType, Buffer.from(JSON.stringify(envelope)), {
    persistent: true,
    contentType: 'application/json',
    messageId: envelope.id,
  });
  await channel.close();
}

async function main() {
  const stamp = Date.now();
  const ratepayerId = randomUUID();
  const propertyId = randomUUID();
  const idempotencyKey = `smoke-${stamp}`;

  console.log('\n1. Service health');
  const healthChecks = [
    ['ratepayer-service', `${API.ratepayer}/health/live`],
    ['property-service', `${API.property}/health/live`],
    ['billing-service', `${API.billing}/health/live`],
    ['payment-service', `${API.payment}/health/live`],
    ['documents-service', `${API.documents}/health/live`],
    ['valuation-service', `${API.valuation}/health/live`],
    ['reconciliation-service', `${API.reconciliation}/health/live`],
    ['reporting-service', `${API.reporting}/health/live`],
    ['croip-integration-service', `${API.integration}/health/live`],
    ['concessions-management-service', `${API.concessions}/health/live`],
    ['gis-service', `${API.gis}/health/live`],
  ];
  for (const [name, url] of healthChecks) {
    try {
      const { status } = await request(url);
      status === 200 ? pass(name) : fail(name, `status ${status}`);
    } catch (err) {
      fail(name, err.message);
    }
  }
  try {
    const res = await fetch(API.portal, { signal: AbortSignal.timeout(15000) });
    res.ok ? pass('idarms-portal') : fail('idarms-portal', `status ${res.status}`);
  } catch (err) {
    fail('idarms-portal', err.message);
  }

  console.log('\n1b. Concession workspace');
  try {
    const assemblies = await request(`${API.concessions}/v1/assemblies`);
    assemblies.status === 200 && Array.isArray(assemblies.body?.data)
      ? pass('assembly onboarding API', `${assemblies.body.data.length} assemblies`)
      : fail('assembly onboarding API', `status ${assemblies.status}`);
    const lookups = await request(`${API.concessions}/v1/lookups`);
    lookups.status === 200 && Array.isArray(lookups.body?.data)
      ? pass('property-type lookups', `${lookups.body.data.length} types`)
      : fail('property-type lookups', `status ${lookups.status}`);
    const zones = await request(`${API.gis}/v1/zones`);
    zones.status === 200 && Array.isArray(zones.body?.data)
      ? pass('GIS zone API', `${zones.body.data.length} zones`)
      : fail('GIS zone API', `status ${zones.status}`);
  } catch (err) {
    fail('concession workspace', err.message);
  }

  console.log('\n2. Downstream sync (CROIP -> iDARMS via the bridge)');
  const connection = await amqp.connect(RABBITMQ_URL);
  await publish(connection, 'croip.ratepayer.registered.v1', {
    id: ratepayerId,
    reference: `SMOKE-RT-${stamp}`,
    fullName: 'Smoke Test Ratepayer',
    phone: '+233200000000',
    status: 'ACTIVE',
  });
  await publish(connection, 'croip.property.registered.v1', {
    id: propertyId,
    reference: `SMOKE-PR-${stamp}`,
    ratepayerId,
    propertyType: 'RESIDENTIAL',
    propertyUsage: 'SINGLE_FAMILY_HOUSE',
    digitalAddress: 'GA-123-4567',
    gpsCoordinates: '5.60,-0.19',
    status: 'PENDING_VERIFICATION',
  });

  try {
    await poll('ratepayer replica', async () => {
      const { body } = await request(`${API.ratepayer}/v1/ratepayers`);
      return (body?.data ?? []).find((row) => row.id === ratepayerId);
    });
    pass('ratepayer replicated');
  } catch (err) {
    fail('ratepayer replicated', err.message);
  }

  try {
    await poll('property replica', async () => {
      const { body } = await request(`${API.property}/v1/properties`);
      return (body?.data ?? []).find((row) => row.id === propertyId);
    });
    pass('property replicated');
  } catch (err) {
    fail('property replicated', err.message);
  }

  console.log('\n3. Field verification -> valuation -> bill');
  const verify = await request(`${API.property}/v1/properties/${propertyId}/verify`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ status: 'APPROVED', notes: 'Smoke verification' }),
  });
  verify.status === 201 && verify.body?.property?.status === 'VERIFIED'
    ? pass('property verified', 'status VERIFIED')
    : fail('property verified', `status ${verify.status}`);

  let bill;
  try {
    bill = await poll('bill generation', async () => {
      const { body } = await request(`${API.billing}/v1/bills`);
      return (body?.data ?? []).find((row) => row.propertyId === propertyId);
    });
    pass('bill issued', `${bill.billNumber} for ${bill.totalAmount ?? bill.amountDue}`);
  } catch (err) {
    fail('bill issued', err.message);
  }

  console.log('\n4. Payment (idempotent checkout + webhook)');
  if (bill) {
    const checkoutBody = JSON.stringify({
      billId: bill.id,
      propertyId,
      amount: Number(bill.totalAmount ?? bill.amountDue),
      channel: 'MOBILE_MONEY',
    });
    const head = { 'content-type': 'application/json', 'idempotency-key': idempotencyKey };

    const first = await request(`${API.payment}/v1/payments/checkout`, { method: 'POST', headers: head, body: checkoutBody });
    first.status === 201 && first.body?.status === 'PENDING'
      ? pass('checkout created', first.body.externalReference ?? first.body.reference)
      : fail('checkout created', `status ${first.status}`);

    const replay = await request(`${API.payment}/v1/payments/checkout`, { method: 'POST', headers: head, body: checkoutBody });
    replay.status === 201 && replay.body?.id === first.body?.id
      ? pass('checkout replay is idempotent')
      : fail('checkout replay is idempotent', `status ${replay.status}, id ${replay.body?.id}`);

    const conflict = await request(`${API.payment}/v1/payments/checkout`, {
      method: 'POST',
      headers: head,
      body: JSON.stringify({ billId: bill.id, propertyId, amount: 1, channel: 'MOBILE_MONEY' }),
    });
    conflict.status === 409
      ? pass('same key + different body rejected', '409')
      : fail('same key + different body rejected', `status ${conflict.status}`);

    const missingKey = await request(`${API.payment}/v1/payments/checkout`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: checkoutBody,
    });
    missingKey.status === 400
      ? pass('missing Idempotency-Key rejected', '400')
      : fail('missing Idempotency-Key rejected', `status ${missingKey.status}`);

    const webhook = await request(`${API.payment}/v1/payments/webhook`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ reference: first.body.reference, status: 'SUCCESS' }),
    });
    webhook.status === 200 && webhook.body?.status === 'SUCCESS'
      ? pass('webhook finalised payment')
      : fail('webhook finalised payment', `status ${webhook.status}`);

    console.log('\n5. Reconciliation and reporting');
    try {
      const discrepancy = await poll('reconciliation', async () => {
        const { body } = await request(`${API.reconciliation}/v1/discrepancies`);
        const rows = body?.data ?? [];
        const unresolved = rows.filter((row) => row.billId === bill.id && !row.resolved);
        return unresolved.length === 0 ? { ok: true } : null;
      });
      discrepancy.ok ? pass('no discrepancy for matching payment') : fail('no discrepancy for matching payment');
    } catch (err) {
      fail('no discrepancy for matching payment', err.message);
    }

    try {
      const metric = await poll('dashboard metrics', async () => {
        const { body } = await request(`${API.reporting}/v1/dashboard/metrics`);
        const rows = body?.data ?? [];
        const collected = rows.reduce((sum, row) => sum + Number(row.totalCollected), 0);
        return collected > 0 ? { collected } : null;
      });
      pass('dashboard metrics updated', `totalCollected=${metric.collected}`);
    } catch (err) {
      fail('dashboard metrics updated', err.message);
    }
  }

  console.log('\n6. Upstream sync (iDARMS -> CROIP)');
  try {
    const sync = await poll('sync records', async () => {
      const { body } = await request(`${API.integration}/v1/sync`);
      const rows = body?.data ?? [];
      const upstream = rows.filter((row) => row.entityId === propertyId && row.direction === 'UPSTREAM');
      return upstream.length > 0 ? upstream : null;
    });
    pass('property recorded for upstream sync', `${sync.length} record(s)`);
  } catch (err) {
    fail('property recorded for upstream sync', err.message);
  }

  await connection.close();

  console.log(failures === 0 ? '\nALL CHECKS PASSED\n' : `\n${failures} CHECK(S) FAILED\n`);
  process.exit(failures === 0 ? 0 : 1);
}

main().catch((err) => {
  console.error('\nSmoke test crashed:', err.message);
  console.error('Is the stack running? Start it with `pnpm dev:all`.');
  process.exit(1);
});
