iDARMS Master System Architecture & Engineering Specification
Decoupled Concessionaire Microservice Ecosystem & CROIP Sync Bridge

⚠️ CRITICAL INSTRUCTION FOR AI AGENTS:
You are building iDARMS, the local operational backend for a Concessionaire. You MUST follow these rules without deviation:

Microservices Only: Do not build a monolith. Build exactly 1 frontend application in apps/ and exactly 9 independent backend applications in services/.

Database Isolation: Every backend service gets its own isolated PostgreSQL database. Cross-service SQL JOINs are strictly forbidden.

Event-Driven: Services communicate ONLY via RabbitMQ (idarms.events exchange) using the Transactional Outbox and Inbox patterns.

Multi-Assembly Tenancy: Every domain table MUST include concessionId and assemblyId extracted from the urn:idarms:context ZITADEL JWT claim.

CQRS Frontend Routing: The Next.js frontend performs Writes (Creates) directly against the CROIP Apex API. It performs all Reads and Local Operations against the local iDARMS microservices.

Ephemeral Concession: iDARMS is a replaceable terminal. CROIP is the permanent System of Record. If a concession is revoked, the iDARMS databases are destroyed and a new concessionaire spins up a fresh instance that re-syncs from CROIP.

1. System Philosophy & Overview
CROIP (Apex): The national system of record. Owns the master Ratepayer and Property registries. you can view the github repo at https://github.com/toughcoder066/croip/
packages, 
apps/croip-portal, 
README.md, 
docker-compose.yml, 
services, 
API_REFRERENCE.md 

- you can also lookup the croip project structure(CROIP_PROJECT_STRUCTURE.md) in this same directory 

iDARMS (Edge): The local operational system. Holds a read-only replica of CROIP master data, plus local operational data (field verifications, billing, payments).

The Bridge (croip-integration-service): The sole component that communicates with CROIP. It listens to CROIP events (to pull data down) and pushes local events up to CROIP.

2. Detachable Monorepo Structure
The platform uses pnpm workspaces and Turborepo. It is fully detachable. It does NOT contain local copies of CROIP's core packages (auth-guard, contracts, logger). It pulls them via NPM registry.

text
idarms-platform/
├── apps/
│   └── idarms-portal/                 # Next.js 16 Admin & Field Agent UI
├── services/                          # 9 independent Fastify microservices
│   ├── ratepayer-service/
│   ├── property-registry-service/
│   ├── documents-service/
│   ├── valuation-service/
│   ├── billing-service/
│   ├── payment-service/
│   ├── reconciliation-service/
│   ├── reporting-service/
│   └── croip-integration-service/
├── packages/
│   └── tsconfig/                      # Base TypeScript configurations
├── infra/
│   └── docker/
│       ├── docker-compose.yml         # Orchestrates 9 DBs + RabbitMQ
│       └── postgres-init/             # Scripts to create 9 isolated databases
├── package.json
├── pnpm-workspace.yaml
└── turbo.json
Note: All services depend on @croip/contracts (Zod schemas) from the private CROIP registry.

3. Authentication & ZITADEL Integration
iDARMS does not use a local auth-guard package. It mirrors the CROIP pattern:

Frontend: Uses NextAuth to authenticate against ZITADEL, storing the JWT.

Backend: Every service has src/plugins/auth.plugin.ts. It uses jose to validate the JWT signature against the CROIP ZITADEL JWKS endpoint.

Context Extraction: It extracts concessionId and assemblyId from the urn:idarms:context claim and injects them into request.auth.

Permissions: Enforces concession:data-producer for local write operations.

4. The CQRS Routing Matrix (Frontend to Backends)
A. Write Commands (Direct to CROIP Apex)
The frontend bypasses local services for creating new master records. It hits the CROIP API directly.

POST https://api.croip.gov.gh/v1/identity/ratepayers (Register Ratepayer)

POST https://api.croip.gov.gh/v1/properties (Register Property)

B. Read Queries & Local Operations (Direct to iDARMS)
All searches, lookups, and operations hit the local iDARMS API Gateway (http://localhost:8080/api/v1/*).

Target Service	Route	Action
ratepayer-service	GET /v1/ratepayers	Search local replica
GET /v1/ratepayers/:id	View local profile
property-registry-service	GET /v1/properties	Search local replica
GET /v1/properties/:id	View local property
POST /v1/properties/:id/verify	Field agent verification
billing-service	POST /v1/bills/generate	Trigger local assessment
GET /v1/bills	View generated bills
payment-service	POST /v1/payments/checkout	Initiate payment
GET /v1/payments	View payment history
reporting-service	GET /v1/dashboard/metrics	Fetch operational KPIs
reconciliation-service	GET /v1/discrepancies	View unmatched payments
5. Standard Golden Template Models
Every microservice MUST include these 4 exact models in schema.prisma.

prisma
model OutboxEvent {
  id                String    @id @default(uuid()) @db.Uuid
  eventType         String
  eventVersion      Int       @default(1)
  aggregateType     String
  aggregateId       String
  aggregateVersion  Int
  routingKey        String
  payload           Json
  headers           Json
  occurredAt        DateTime  @default(now())
  publishedAt       DateTime?
  attempts          Int       @default(0)
  nextAttemptAt     DateTime  @default(now())
  lockedAt          DateTime?
  lastError         String?
  @@index([publishedAt, nextAttemptAt, occurredAt])
  @@map("outbox_events")
}

model InboxMessage {
  id          String    @id @default(uuid()) @db.Uuid
  consumerId  String
  messageId   String    @db.Uuid
  eventType   String
  receivedAt  DateTime  @default(now())
  processedAt DateTime?
  result      Json?
  @@unique([consumerId, messageId])
  @@map("inbox_messages")
}

model AuditRecord {
  id             String   @id @default(uuid()) @db.Uuid
  occurredAt     DateTime @default(now())
  actorId        String
  actorType      String
  concessionId   String?  @db.Uuid
  assemblyId     String?  @db.Uuid
  action         String
  resourceType   String
  resourceId     String?
  requestId      String
  sourceIp       String?
  outcome        String
  metadata       Json
  @@index([concessionId, assemblyId, occurredAt])
  @@map("audit_records")
}

model IdempotencyRecord {
  id             String   @id @default(uuid()) @db.Uuid
  concessionId   String   @db.Uuid
  idempotencyKey String
  requestHash    String
  responseStatus Int?
  responseBody   Json?
  createdAt      DateTime @default(now())
  expiresAt      DateTime
  @@unique([concessionId, idempotencyKey])
  @@map("idempotency_records")
}
6. The 9 Microservice Schemas
6.1 ratepayer-service (idarms_ratepayer_db)
Read-only replica for local search.

prisma
// + [Include 4 Standard Models Here]
model Ratepayer {
  id             String   @id @db.Uuid // Matches CROIP ID
  concessionId   String   @db.Uuid
  assemblyId     String   @db.Uuid
  reference      String   @unique 
  fullName       String
  ghanaCardId    String?  @unique
  phone          String?
  email          String?
  status         String   
  lastSyncedAt   DateTime @default(now()) 
  @@index([concessionId, assemblyId, status])
  @@index([concessionId, fullName])
  @@map("ratepayers")
}
6.2 property-registry-service (idarms_property_db)
Local replica + field verifications.

prisma
// + [Include 4 Standard Models Here]
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
  id             String   @id @default(uuid()) @db.Uuid
  propertyId     String   @db.Uuid
  agentId        String   @db.Uuid 
  status         String   // APPROVED, REJECTED
  notes          String?
  photoUrl       String?
  verifiedAt     DateTime @default(now())
  @@index([propertyId])
  @@map("field_verifications")
}
6.3 documents-service (idarms_document_db)
S3/Blob file references.

prisma
// + [Include 4 Standard Models Here]
model Document {
  id             String   @id @default(uuid()) @db.Uuid
  concessionId   String   @db.Uuid
  assemblyId     String   @db.Uuid
  entityType     String   // RATEPAYER, PROPERTY
  entityId       String   @db.Uuid 
  documentType   String   // GHANA_CARD, TITLE_DEED
  fileUrl        String
  uploadedBy     String   @db.Uuid
  createdAt      DateTime @default(now())
  @@index([concessionId, entityType, entityId])
  @@map("documents")
}
6.4 valuation-service (idarms_valuation_db)
Calculates taxable value.

prisma
// + [Include 4 Standard Models Here]
model PropertyReplica {
  id             String   @id @db.Uuid
  assemblyId     String   @db.Uuid
  propertyType   String
  status         String
  @@map("property_replicas")
}

model Valuation {
  id             String   @id @default(uuid()) @db.Uuid
  propertyId     String   @unique @db.Uuid
  assemblyId     String   @db.Uuid
  marketValue    Decimal  @db.Decimal(12, 2)
  taxableValue   Decimal  @db.Decimal(12, 2)
  fiscalYear     Int
  createdAt      DateTime @default(now())
  @@map("valuations")
}
6.5 billing-service (idarms_billing_db)
High-compute bill generation.

prisma
// + [Include 4 Standard Models Here]
model ValuationReplica {
  id             String   @id @db.Uuid
  propertyId     String   @unique @db.Uuid
  assemblyId     String   @db.Uuid
  taxableValue   Decimal  @db.Decimal(12, 2)
  @@map("valuation_replicas")
}

model Bill {
  id             String   @id @default(uuid()) @db.Uuid
  concessionId   String   @db.Uuid
  assemblyId     String   @db.Uuid
  billNumber     String   @unique
  propertyId     String   @db.Uuid
  amountDue      Decimal  @db.Decimal(12, 2)
  amountPaid     Decimal  @db.Decimal(12, 2) @default(0.00)
  status         String   // DRAFT, ISSUED, PAID
  fiscalYear     Int
  createdAt      DateTime @default(now())
  @@index([concessionId, assemblyId, status])
  @@map("bills")
}
6.6 payment-service (idarms_payment_db)
Secure gateway integration.

prisma
// + [Include 4 Standard Models Here]
model BillReplica {
  id             String   @id @db.Uuid
  assemblyId     String   @db.Uuid
  amountDue      Decimal  @db.Decimal(12, 2)
  status         String
  @@map("bill_replicas")
}

model Payment {
  id             String   @id @default(uuid()) @db.Uuid
  concessionId   String   @db.Uuid
  assemblyId     String   @db.Uuid
  billId         String   @db.Uuid
  amount         Decimal  @db.Decimal(12, 2)
  channel        String   // MOMO, CARD
  gatewayRef     String   @unique
  status         String   // PENDING, SUCCESSFUL, FAILED
  createdAt      DateTime @default(now())
  @@index([concessionId, assemblyId, status])
  @@map("payments")
}
6.7 reconciliation-service (idarms_reconciliation_db)
Local ledger balancing.

prisma
// + [Include 4 Standard Models Here]
model BillReplica {
  id             String   @id @db.Uuid
  amountDue      Decimal  @db.Decimal(12, 2)
  @@map("bill_replicas")
}

model PaymentReplica {
  id             String   @id @db.Uuid
  billId         String   @db.Uuid
  amount         Decimal  @db.Decimal(12, 2)
  status         String
  @@map("payment_replicas")
}

model Discrepancy {
  id             String   @id @default(uuid()) @db.Uuid
  billId         String   @db.Uuid
  paymentId      String   @db.Uuid
  reason         String   // AMOUNT_MISMATCH, UNMATCHED_PAYMENT
  resolved       Boolean  @default(false)
  createdAt      DateTime @default(now())
  @@map("discrepancies")
}
6.8 reporting-service (idarms_reporting_db)
Dashboard aggregates.

prisma
// + [Include 4 Standard Models Here]
model DashboardMetric {
  id             String   @id @default(uuid()) @db.Uuid
  concessionId   String   @db.Uuid
  assemblyId     String   @db.Uuid
  date           DateTime @db.Date
  totalBilled    Decimal  @db.Decimal(12, 2) @default(0)
  totalCollected Decimal  @db.Decimal(12, 2) @default(0)
  propertiesVerified Int  @default(0)
  @@unique([concessionId, assemblyId, date])
  @@map("dashboard_metrics")
}
6.9 croip-integration-service (idarms_integration_db)
The sole bridge for CROIP sync.

prisma
// + [Include 4 Standard Models Here]
model SyncRecord {
  id             String   @id @default(uuid()) @db.Uuid
  entityType     String   // PROPERTY, PAYMENT
  entityId       String   @db.Uuid
  direction      String   // UPSTREAM, DOWNSTREAM
  status         String   // SYNCED, FAILED
  croipReference String?
  lastSyncedAt   DateTime @default(now())
  @@unique([entityType, entityId, direction])
  @@map("sync_records")
}
7. Event Flows & Synchronization
A. Downstream Sync (CROIP → iDARMS)
Frontend creates a Ratepayer via CROIP API.

CROIP saves the master record and emits croip.ratepayer.registered.v1 to croip.events.

croip-integration-service Inbox catches the event, verifies the concessionId, and publishes it to the local idarms.events exchange.

ratepayer-service Inbox catches it and upserts the record into idarms_ratepayer_db.

B. Local Operational Loop (iDARMS Internal)
Verify: Field agent verifies property locally. property-registry-service updates DB and emits property.verified.v1.

Valuation: valuation-service Inbox catches it, updates replica, calculates value, emits property.valuation_completed.v1.

Billing: billing-service Inbox catches it, updates replica, generates bill, emits bill.issued.v1.

Payment: payment-service Inbox catches it, updates replica. Gateway processes payment. payment-service emits payment.collected.v1.

C. Upstream Sync (iDARMS → CROIP)
croip-integration-service Inbox is bound to idarms.events.

It catches property.verified.v1, bill.issued.v1, and payment.collected.v1.

It writes to SyncRecord (to prevent duplicates).

It pushes the event up to the national croip.events exchange via its Outbox Worker.

8. AI Execution Roadmap
Follow these phases sequentially.

Phase 1: Infrastructure & Monorepo
Initialize Turborepo + pnpm workspaces.

Create infra/docker/docker-compose.yml containing PostgreSQL (with an init script to create 9 databases) and RabbitMQ.

Scaffold the 9 services/* folders using the Golden Template(golden_template.md) in this same directory. Scaffold apps/idarms-portal (Next.js).

Phase 2: Frontend & Master Data Routing (CQRS)
Build the Next.js RatepayerForm. Wire it to POST https://api.croip.gov.gh/v1/identity/ratepayers.

Build the Next.js RatepayerList. Wire it to GET http://localhost:8080/api/v1/ratepayers.

Build ratepayer-service and property-registry-service. Implement their Inbox Workers to sync down from croip-integration-service.

Phase 3: The Sync Bridge
Implement croip-integration-service.

Build the Inbox Worker bound to croip.events (to push down to local).

Build the Outbox Worker (to push local verifications/payments up to CROIP).

Phase 4: Assessment & Financial Engine
Implement valuation-service and billing-service.

Implement their Inbox Workers to consume local events.

Ensure all writes are wrapped in prisma.$transaction with an OutboxEvent insert.

Phase 5: Payments & Dashboard
Implement payment-service. Implement the secure webhook handler.

Implement reporting-service to aggregate metrics.

Build the Next.js Dashboard views (/dashboard, /billing) pointing to the local reporting-service.

