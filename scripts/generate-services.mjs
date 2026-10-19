import { readFileSync, writeFileSync, mkdirSync, readdirSync, statSync } from 'node:fs';
import { join, relative, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = join(__dirname, '..');
const templateDir = join(__dirname, 'service-template');
const servicesDir = join(root, 'services');

// ---------------------------------------------------------------------------
// Service registry. `domainModels` is the Prisma block appended after the four
// standard models (OutboxEvent / InboxMessage / AuditRecord / IdempotencyRecord).
// ---------------------------------------------------------------------------
const services = [
  {
    name: 'ratepayer-service',
    package: '@idarms/ratepayer-service',
    port: 3020,
    db: 'idarms_ratepayer_db',
    moduleName: 'ratepayers',
    modelKey: 'ratepayer',
    readPermission: 'ratepayer:read',
    routePrefix: '/v1/ratepayers',
    routeTag: 'ratepayers',
    permissions: ['ratepayer:read'],
    consumedRoutingKeys: ['ratepayer.registered.v1'],
    publishedEvents: [],
    listWhere: '{ concessionId: scope.concessionId, assemblyId: scope.assemblyId }',
    getWhere: '{ id, concessionId: scope.concessionId, assemblyId: scope.assemblyId }',
    domainModels: `
model Ratepayer {
  id           String   @id @db.Uuid // Matches CROIP ID
  concessionId String   @db.Uuid
  assemblyId   String   @db.Uuid
  reference    String   @unique
  fullName     String
  ghanaCardId  String?  @unique
  phone        String?
  email        String?
  status       String
  lastSyncedAt DateTime @default(now())

  @@index([concessionId, assemblyId, status])
  @@index([concessionId, fullName])
  @@map("ratepayers")
}`,
  },
  {
    name: 'property-registry-service',
    package: '@idarms/property-registry-service',
    port: 3010,
    db: 'idarms_property_db',
    moduleName: 'properties',
    modelKey: 'property',
    readPermission: 'property:read',
    routePrefix: '/v1/properties',
    routeTag: 'properties',
    permissions: ['property:read', 'property:create', 'property:verify', 'property:update'],
    consumedRoutingKeys: ['property.registered.v1'],
    publishedEvents: ['property.verified.v1'],
    listWhere: '{ concessionId: scope.concessionId, assemblyId: scope.assemblyId }',
    getWhere: '{ id, concessionId: scope.concessionId, assemblyId: scope.assemblyId }',
    domainModels: `
model Property {
  id             String   @id @db.Uuid // Matches CROIP ID
  concessionId   String   @db.Uuid
  assemblyId     String   @db.Uuid
  reference      String   @unique
  ratepayerId    String   @db.Uuid
  propertyType   String
  gpsCoordinates String?
  status         String   // PENDING_VERIFICATION, VERIFIED
  lastSyncedAt   DateTime @default(now())

  @@index([concessionId, assemblyId, status])
  @@index([concessionId, reference])
  @@map("properties")
}

model FieldVerification {
  id         String   @id @default(uuid()) @db.Uuid
  propertyId String   @db.Uuid
  agentId    String   @db.Uuid
  status     String   // APPROVED, REJECTED
  notes      String?
  photoUrl   String?
  verifiedAt DateTime @default(now())

  @@index([propertyId])
  @@map("field_verifications")
}`,
  },
  {
    name: 'documents-service',
    package: '@idarms/documents-service',
    port: 3050,
    db: 'idarms_document_db',
    moduleName: 'documents',
    modelKey: 'document',
    readPermission: 'document:read',
    routePrefix: '/v1/documents',
    routeTag: 'documents',
    permissions: ['document:read', 'document:upload'],
    consumedRoutingKeys: [],
    publishedEvents: ['document.uploaded.v1'],
    listWhere: '{ concessionId: scope.concessionId, assemblyId: scope.assemblyId }',
    getWhere: '{ id, concessionId: scope.concessionId, assemblyId: scope.assemblyId }',
    domainModels: `
model Document {
  id           String   @id @default(uuid()) @db.Uuid
  concessionId String   @db.Uuid
  assemblyId   String   @db.Uuid
  entityType   String   // RATEPAYER, PROPERTY
  entityId     String   @db.Uuid
  documentType String   // GHANA_CARD, TITLE_DEED
  fileUrl      String
  uploadedBy   String   @db.Uuid
  createdAt    DateTime @default(now())

  @@index([concessionId, entityType, entityId])
  @@map("documents")
}`,
  },
  {
    name: 'valuation-service',
    package: '@idarms/valuation-service',
    port: 3060,
    db: 'idarms_valuation_db',
    moduleName: 'valuations',
    modelKey: 'valuation',
    readPermission: 'valuation:read',
    routePrefix: '/v1/valuations',
    routeTag: 'valuations',
    permissions: ['valuation:read', 'valuation:calculate'],
    consumedRoutingKeys: ['property.verified.v1'],
    publishedEvents: ['property.valuation_completed.v1'],
    listWhere: '{ assemblyId: scope.assemblyId }',
    getWhere: '{ id, assemblyId: scope.assemblyId }',
    domainModels: `
model PropertyReplica {
  id           String @id @db.Uuid
  assemblyId   String @db.Uuid
  propertyType String
  status       String

  @@map("property_replicas")
}

model Valuation {
  id           String   @id @default(uuid()) @db.Uuid
  propertyId   String   @unique @db.Uuid
  assemblyId   String   @db.Uuid
  marketValue  Decimal  @db.Decimal(12, 2)
  taxableValue Decimal  @db.Decimal(12, 2)
  fiscalYear   Int
  createdAt    DateTime @default(now())

  @@map("valuations")
}`,
  },
  {
    name: 'billing-service',
    package: '@idarms/billing-service',
    port: 3030,
    db: 'idarms_billing_db',
    moduleName: 'bills',
    modelKey: 'bill',
    readPermission: 'bill:read',
    routePrefix: '/v1/bills',
    routeTag: 'bills',
    permissions: ['bill:read', 'bill:generate'],
    consumedRoutingKeys: ['property.valuation_completed.v1'],
    publishedEvents: ['bill.issued.v1'],
    listWhere: '{ concessionId: scope.concessionId, assemblyId: scope.assemblyId }',
    getWhere: '{ id, concessionId: scope.concessionId, assemblyId: scope.assemblyId }',
    domainModels: `
model ValuationReplica {
  id           String  @id @db.Uuid
  propertyId   String  @unique @db.Uuid
  assemblyId   String  @db.Uuid
  taxableValue Decimal @db.Decimal(12, 2)

  @@map("valuation_replicas")
}

model Bill {
  id           String   @id @default(uuid()) @db.Uuid
  concessionId String   @db.Uuid
  assemblyId   String   @db.Uuid
  billNumber   String   @unique
  propertyId   String   @db.Uuid
  amountDue    Decimal  @db.Decimal(12, 2)
  amountPaid   Decimal  @db.Decimal(12, 2) @default(0.00)
  status       String   // DRAFT, ISSUED, PAID
  fiscalYear   Int
  createdAt    DateTime @default(now())

  @@index([concessionId, assemblyId, status])
  @@map("bills")
}`,
  },
  {
    name: 'payment-service',
    package: '@idarms/payment-service',
    port: 3040,
    db: 'idarms_payment_db',
    moduleName: 'payments',
    modelKey: 'payment',
    readPermission: 'payment:read',
    routePrefix: '/v1/payments',
    routeTag: 'payments',
    permissions: ['payment:read', 'payment:checkout'],
    consumedRoutingKeys: ['bill.issued.v1'],
    publishedEvents: ['payment.collected.v1'],
    listWhere: '{ concessionId: scope.concessionId, assemblyId: scope.assemblyId }',
    getWhere: '{ id, concessionId: scope.concessionId, assemblyId: scope.assemblyId }',
    domainModels: `
model BillReplica {
  id         String  @id @db.Uuid
  assemblyId String  @db.Uuid
  amountDue  Decimal @db.Decimal(12, 2)
  status     String

  @@map("bill_replicas")
}

model Payment {
  id           String   @id @default(uuid()) @db.Uuid
  concessionId String   @db.Uuid
  assemblyId   String   @db.Uuid
  billId       String   @db.Uuid
  amount       Decimal  @db.Decimal(12, 2)
  channel      String   // MOMO, CARD
  gatewayRef   String   @unique
  status       String   // PENDING, SUCCESSFUL, FAILED
  createdAt    DateTime @default(now())

  @@index([concessionId, assemblyId, status])
  @@map("payments")
}`,
  },
  {
    name: 'reconciliation-service',
    package: '@idarms/reconciliation-service',
    port: 3070,
    db: 'idarms_reconciliation_db',
    moduleName: 'discrepancies',
    modelKey: 'discrepancy',
    readPermission: 'reconciliation:read',
    routePrefix: '/v1/discrepancies',
    routeTag: 'discrepancies',
    permissions: ['reconciliation:read', 'reconciliation:reconcile'],
    consumedRoutingKeys: ['payment.collected.v1'],
    publishedEvents: ['reconciliation.discrepancy_detected.v1'],
    listWhere: '{}',
    getWhere: '{ id }',
    domainModels: `
model BillReplica {
  id        String  @id @db.Uuid
  amountDue Decimal @db.Decimal(12, 2)

  @@map("bill_replicas")
}

model PaymentReplica {
  id       String  @id @db.Uuid
  billId   String  @db.Uuid
  amount   Decimal @db.Decimal(12, 2)
  status   String

  @@map("payment_replicas")
}

model Discrepancy {
  id        String   @id @default(uuid()) @db.Uuid
  billId    String   @db.Uuid
  paymentId String   @db.Uuid
  reason    String   // AMOUNT_MISMATCH, UNMATCHED_PAYMENT
  resolved  Boolean  @default(false)
  createdAt DateTime @default(now())

  @@map("discrepancies")
}`,
  },
  {
    name: 'reporting-service',
    package: '@idarms/reporting-service',
    port: 3080,
    db: 'idarms_reporting_db',
    moduleName: 'dashboard',
    modelKey: 'dashboardMetric',
    readPermission: 'reporting:read',
    routePrefix: '/v1/dashboard/metrics',
    routeTag: 'dashboard',
    permissions: ['reporting:read'],
    consumedRoutingKeys: ['property.verified.v1', 'bill.issued.v1', 'payment.collected.v1'],
    publishedEvents: [],
    listWhere: '{ concessionId: scope.concessionId, assemblyId: scope.assemblyId }',
    getWhere: '{ id, concessionId: scope.concessionId, assemblyId: scope.assemblyId }',
    domainModels: `
model DashboardMetric {
  id                 String   @id @default(uuid()) @db.Uuid
  concessionId       String   @db.Uuid
  assemblyId         String   @db.Uuid
  date               DateTime @db.Date
  totalBilled        Decimal  @db.Decimal(12, 2) @default(0)
  totalCollected     Decimal  @db.Decimal(12, 2) @default(0)
  propertiesVerified Int      @default(0)

  @@unique([concessionId, assemblyId, date])
  @@map("dashboard_metrics")
}`,
  },
  {
    name: 'croip-integration-service',
    package: '@idarms/croip-integration-service',
    port: 3090,
    db: 'idarms_integration_db',
    moduleName: 'sync',
    modelKey: 'syncRecord',
    readPermission: 'integration:sync',
    routePrefix: '/v1/sync',
    routeTag: 'sync',
    permissions: ['integration:sync'],
    consumedRoutingKeys: ['property.verified.v1', 'bill.issued.v1', 'payment.collected.v1'],
    publishedEvents: [],
    listWhere: '{}',
    getWhere: '{ id }',
    domainModels: `
model SyncRecord {
  id             String   @id @default(uuid()) @db.Uuid
  entityType     String   // PROPERTY, PAYMENT, RATEPAYER
  entityId       String   @db.Uuid
  direction      String   // UPSTREAM, DOWNSTREAM
  status         String   // SYNCED, FAILED
  croipReference String?
  lastSyncedAt   DateTime @default(now())

  @@unique([entityType, entityId, direction])
  @@map("sync_records")
}`,
  },
];

function replaceTokens(input, tokens) {
  return Object.entries(tokens).reduce((acc, [key, value]) => {
    return acc.split(`__${key}__`).join(String(value));
  }, input);
}

function walk(dir) {
  const out = [];
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) {
      out.push(...walk(full));
    } else {
      out.push(full);
    }
  }
  return out;
}

function generateService(svc) {
  const tokens = {
    SERVICE_NAME: svc.name,
    PACKAGE_NAME: svc.package,
    PORT: String(svc.port),
    DB_NAME: svc.db,
    MODULE_NAME: svc.moduleName,
    MODEL_KEY: svc.modelKey,
    READ_PERMISSION: svc.readPermission,
    ROUTE_PREFIX: svc.routePrefix,
    ROUTE_TAG: svc.routeTag,
    PERMISSIONS: JSON.stringify(svc.permissions),
    LIST_WHERE: svc.listWhere,
    GET_WHERE: svc.getWhere,
    CONSUMED_ROUTING_KEYS: JSON.stringify(svc.consumedRoutingKeys),
    PUBLISHED_EVENTS: JSON.stringify(svc.publishedEvents),
    DOMAIN_MODELS: svc.domainModels.trim(),
  };

  const dest = join(servicesDir, svc.name);
  mkdirSync(dest, { recursive: true });

  for (const file of walk(templateDir)) {
    const rel = relative(templateDir, file);
    const relReplaced = replaceTokens(rel, tokens);
    const target = join(dest, relReplaced);
    mkdirSync(dirname(target), { recursive: true });
    const content = replaceTokens(readFileSync(file, 'utf8'), tokens);
    writeFileSync(target, content);
  }

  console.log(`generated ${svc.name}`);
}

for (const svc of services) {
  generateService(svc);
}

console.log(`Done. Generated ${services.length} services in ${servicesDir}`);
