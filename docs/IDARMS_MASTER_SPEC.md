iDARMS Master System Architecture & Engineering Specification
Decoupled Concessionaire Microservice Ecosystem & CROIP Sync Bridge

⚠️ CRITICAL INSTRUCTION FOR AI AGENTS:
You are building iDARMS, the local operational backend for a Concessionaire. You MUST follow these rules without deviation:

Microservices Only: Do not build a monolith. Build exactly 1 frontend application in apps/ and exactly 11 independent backend applications in services/ (the original 9 plus concessions-management-service and gis-service).

Database Isolation: Every backend service gets its own isolated PostgreSQL database. Cross-service SQL JOINs are strictly forbidden.

Event-Driven: Services communicate ONLY via RabbitMQ (idarms.events exchange) using the Transactional Outbox and Inbox patterns.

Multi-Assembly Tenancy: Every domain table MUST include concessionId and assemblyId resolved from the ZITADEL organization/role claims through the org registry.

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
├── services/                          # 11 independent Fastify microservices
│   ├── ratepayer-service/
│   ├── property-service/
│   ├── concessions-management-service/
│   ├── gis-service/
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
│       ├── docker-compose.yml         # Orchestrates 11 DBs + RabbitMQ
│       └── postgres-init/             # Scripts to create 9 isolated databases
├── package.json
├── pnpm-workspace.yaml
└── turbo.json
Note: All services depend on @croip/contracts (Zod schemas) from the private CROIP registry.

3. Authentication & ZITADEL Integration
iDARMS does not use a local auth-guard package. It mirrors the CROIP pattern:

Frontend: Uses NextAuth to authenticate against ZITADEL, storing the JWT.

Backend: Every service has src/plugins/auth.plugin.ts. It uses jose to validate the JWT signature against the CROIP ZITADEL JWKS endpoint.

Context Extraction: It parses ZITADEL role/resource-owner claims and resolves concessionId/assemblyId from the org registry into request.auth.

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
property-service	GET /v1/properties	Search local portfolio
GET /v1/properties/:id	View local property
POST /v1/properties/:id/verify	Field agent verification
concessions-management-service	GET /v1/concessions	View concession contract
gis-service	GET /v1/zones	View spatial zones and blocks
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
6.2 property-service (idarms_property_db)
Operational property portfolio, dual identifiers, GIS coordinates and verification audit states.

prisma
// + [Include 4 Standard Models Here]
model Property {
  id                 String             @id @db.Uuid
  croipPropertyId    String?            @unique @map("croip_property_id") @db.Uuid
  externalPropertyId String             @map("external_property_id")
  concessionId       String             @map("concession_id") @db.Uuid
  assemblyId         String             @map("assembly_id") @db.Uuid
  ratepayerRef       String?            @map("ratepayer_ref") @db.Uuid
  digitalAddress     String?            @map("digital_address") @db.VarChar(15)
  zoneCode           String?            @map("zone_code")
  blockCode          String?            @map("block_code")
  addressText        String?            @map("address_text")
  latitude           Float?             @db.DoublePrecision
  longitude          Float?             @db.DoublePrecision
  propertyType       PropertyType       @default(UNCLASSIFIED) @map("property_type")
  propertyUsage      PropertyUsage      @default(GENERAL) @map("property_usage")
  ratableValue       Decimal?           @default(0.00) @map("ratable_value") @db.Decimal(14, 2)
  status             PropertyStatus     @default(SUBMITTED)
  registrationSource RegistrationSource @default(MOBILE_FIELD_APP) @map("registration_source")
  isBillGenerated    Boolean            @default(false) @map("is_bill_generated")
  documentIds        String[]           @default([]) @map("document_ids")
  registeredBy       String             @default("00000000-0000-0000-0000-000000000000") @map("registered_by") @db.Uuid
  verifiedBy         String?            @map("verified_by") @db.Uuid
  verifiedAt         DateTime?          @map("verified_at")
  createdAt          DateTime           @default(now()) @map("created_at")
  updatedAt          DateTime           @updatedAt @map("updated_at")
  lastSyncedAt       DateTime?          @map("last_synced_at")
  version            Int                @default(1)
  verifications      FieldVerification[]
  @@unique([concessionId, externalPropertyId])
  @@index([concessionId, assemblyId, status])
  @@map("properties")
}

model FieldVerification {
  id              String            @id @default(uuid()) @db.Uuid
  propertyId      String            @map("property_id") @db.Uuid
  agentId         String            @map("agent_id") @db.Uuid
  status          VerificationState
  notes           String?           @db.Text
  photoDocumentId String?           @map("photo_document_id") @db.Uuid
  verifiedAt      DateTime          @default(now()) @map("verified_at")
  property        Property          @relation(fields: [propertyId], references: [id], onDelete: Cascade)
  @@index([propertyId])
  @@map("field_verifications")
}
6.3 documents-service (idarms_document_db)
Polymorphic S3/MinIO metadata for the presigned-upload pattern. Binary content never reaches this service.

prisma
// + [Include 4 Standard Models Here]
model Document {
  id              String       @id @default(uuid()) @db.Uuid
  concessionId    String       @db.Uuid @map("concession_id")
  assemblyId      String       @db.Uuid @map("assembly_id")
  entityType      EntityType   @map("entity_type")
  entityId        String       @db.Uuid @map("entity_id")
  documentType    String       @map("document_type")
  storageProvider String       @default("S3") @map("storage_provider")
  storageKey      String?      @map("storage_key")
  fileUrl         String?      @map("file_url")
  fileName        String?      @map("file_name")
  mimeType        String?      @map("mime_type")
  fileSize        Int?         @map("file_size")
  checksum        String?
  uploadStatus    UploadStatus @default(PENDING_UPLOAD) @map("upload_status")
  uploadedBy      String?      @db.Uuid @map("uploaded_by")
  uploadedAt      DateTime?    @map("uploaded_at")
  metadata        Json?
  createdAt       DateTime     @default(now()) @map("created_at")
  updatedAt       DateTime     @updatedAt @map("updated_at")
  @@index([concessionId, assemblyId])
  @@index([entityType, entityId])
  @@map("documents")
}

enum EntityType { PROPERTY RATEPAYER BILL PAYMENT }
enum UploadStatus { PENDING_UPLOAD UPLOADED FAILED DELETED }
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
Fee-fixing assessment, penalties, discounts and bill lifecycle.

prisma
// + [Include 4 Standard Models Here]
model ValuationReplica {
  id            String   @id @db.Uuid
  concessionId  String   @db.Uuid @map("concession_id")
  assemblyId    String   @db.Uuid @map("assembly_id")
  propertyId    String   @unique @db.Uuid @map("property_id")
  propertyType  String   @map("property_type")
  propertyUsage String   @default("GENERAL") @map("property_usage")
  taxableValue  Decimal  @db.Decimal(14, 2) @map("taxable_value")
  fiscalYear    Int      @map("fiscal_year")
  syncedAt      DateTime @default(now()) @map("synced_at")
  @@map("valuation_replicas")
}

model FeeFixingReplica {
  id                String   @id @db.Uuid
  assemblyId        String   @db.Uuid @map("assembly_id")
  fiscalYear        Int      @map("fiscal_year")
  propertyTypeCode  String   @map("property_type_code")
  propertyUsageCode String   @map("property_usage_code")
  baseRate          Decimal  @db.Decimal(12, 2) @map("base_rate")
  rateImpost        Decimal  @db.Decimal(5, 4) @map("rate_impost")
  currency          String   @default("GHS")
  sourceVersion     Int      @default(1) @map("source_version")
  syncedAt          DateTime @default(now()) @map("synced_at")
  @@unique([assemblyId, fiscalYear, propertyTypeCode, propertyUsageCode])
  @@map("fee_fixing_replicas")
}

model Bill {
  id             String     @id @default(uuid()) @db.Uuid
  billNumber     String     @unique @map("bill_number")
  concessionId   String     @db.Uuid @map("concession_id")
  assemblyId     String     @db.Uuid @map("assembly_id")
  propertyId     String     @db.Uuid @map("property_id")
  fiscalYear     Int        @map("fiscal_year")
  ratableValue   Decimal    @db.Decimal(14, 2) @map("ratable_value")
  baseRate       Decimal    @db.Decimal(12, 2) @map("base_rate")
  rateImpost     Decimal    @db.Decimal(5, 4) @map("rate_impost")
  subTotal       Decimal    @db.Decimal(12, 2) @map("sub_total")
  penaltyAmount  Decimal    @default(0.00) @db.Decimal(12, 2) @map("penalty_amount")
  discountAmount Decimal    @default(0.00) @db.Decimal(12, 2) @map("discount_amount")
  totalAmount    Decimal    @db.Decimal(12, 2) @map("total_amount")
  amountPaid     Decimal    @default(0.00) @db.Decimal(12, 2) @map("amount_paid")
  currency       String     @default("GHS")
  status         BillStatus @default(UNPAID)
  issuedAt       DateTime   @default(now()) @map("issued_at")
  dueDate        DateTime   @map("due_date")
  createdAt      DateTime   @default(now()) @map("created_at")
  updatedAt      DateTime   @updatedAt @map("updated_at")
  @@unique([propertyId, fiscalYear])
  @@index([concessionId, assemblyId, status])
  @@map("bills")
}

enum BillStatus { UNPAID PARTIALLY_PAID PAID OVERDUE CANCELLED }
6.6 payment-service (idarms_payment_db)
Provider-agnostic payment intents and gateway callbacks.

prisma
// + [Include 4 Standard Models Here]
model BillReplica {
  id           String    @id @db.Uuid
  concessionId String    @db.Uuid @map("concession_id")
  assemblyId   String    @db.Uuid @map("assembly_id")
  propertyId   String    @db.Uuid @map("property_id")
  fiscalYear   Int       @map("fiscal_year")
  totalAmount  Decimal   @db.Decimal(12, 2) @map("total_amount")
  amountPaid   Decimal   @default(0.00) @db.Decimal(12, 2) @map("amount_paid")
  currency     String    @default("GHS")
  status       String
  dueDate      DateTime? @map("due_date")
  syncedAt     DateTime  @default(now()) @map("synced_at")
  @@map("bill_replicas")
}

model PaymentTransaction {
  id                 String            @id @default(uuid()) @db.Uuid
  reference          String            @unique
  externalReference  String?           @unique @map("external_reference")
  billId             String            @db.Uuid @map("bill_id")
  propertyId         String            @db.Uuid @map("property_id")
  concessionId       String            @db.Uuid @map("concession_id")
  assemblyId         String            @db.Uuid @map("assembly_id")
  amount             Decimal           @db.Decimal(12, 2)
  currency           String            @default("GHS")
  channel            PaymentChannel    @map("channel")
  provider           String            @default("PAYSTACK")
  status             PaymentStatus     @default(PENDING)
  payerPhone         String?           @map("payer_phone")
  payerEmail         String?           @map("payer_email")
  failureReason      String?           @map("failure_reason")
  rawGatewayResponse Json?             @map("raw_gateway_response")
  paidAt             DateTime?         @map("paid_at")
  createdAt          DateTime          @default(now()) @map("created_at")
  updatedAt          DateTime          @updatedAt @map("updated_at")
  @@index([concessionId, assemblyId, status])
  @@map("payment_transactions")
}

enum PaymentChannel { MOBILE_MONEY BANK_CARD POS_TERMINAL CASH_DESK }
enum PaymentStatus { PENDING SUCCESS FAILED REVERSED }
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
  entityType     String   // PROPERTY, RATEPAYER, BILL, PAYMENT, CONCESSION
  entityId       String   @db.Uuid
  direction      String   // UPSTREAM, DOWNSTREAM
  status         String   // SYNCED, PENDING, FAILED
  croipReference String?
  lastSyncedAt   DateTime @default(now())
  @@unique([entityType, entityId, direction])
  @@index([entityType, direction, status])
  @@map("sync_records")
}

6.10 concessions-management-service (concession_mgmt_db)
Concession contract, multi-assembly jurisdiction, classification lookups and annual fee-fixing bylaws.

prisma
// + [Include 4 Standard Models Here]
model ConcessionContract {
  id                  String               @id @default(uuid()) @db.Uuid
  concessionCode      String               @unique @map("concession_code")
  concessionName      String               @map("concession_name")
  stateRevenueShare   Decimal              @db.Decimal(5, 2) @map("state_revenue_share")
  concessionaireShare Decimal              @db.Decimal(5, 2) @map("concessionaire_share")
  startDate           DateTime             @map("start_date")
  endDate             DateTime             @map("end_date")
  isActive            Boolean              @default(true) @map("is_active")
  assemblies          ConcessionAssembly[]
  createdAt           DateTime             @default(now()) @map("created_at")
  updatedAt           DateTime             @updatedAt @map("updated_at")
  @@map("concession_contracts")
}

model Assembly {
  id           String               @id @default(uuid()) @db.Uuid
  assemblyCode String               @unique @map("assembly_code")
  assemblyName String               @map("assembly_name")
  region       String
  prefixRules  String[]             @map("prefix_rules")
  isActive     Boolean              @default(true) @map("is_active")
  concessions  ConcessionAssembly[]
  feeFixings   FeeFixingBylaw[]
  createdAt    DateTime             @default(now()) @map("created_at")
  updatedAt    DateTime             @updatedAt @map("updated_at")
  @@map("assemblies")
}

model ConcessionAssembly {
  id           String             @id @default(uuid()) @db.Uuid
  concessionId String             @map("concession_id") @db.Uuid
  assemblyId   String             @map("assembly_id") @db.Uuid
  contract     ConcessionContract @relation(fields: [concessionId], references: [id], onDelete: Cascade)
  assembly     Assembly           @relation(fields: [assemblyId], references: [id], onDelete: Restrict)
  assignedAt   DateTime           @default(now()) @map("assigned_at")
  @@unique([concessionId, assemblyId])
  @@map("concession_assemblies")
}

model PropertyTypeLookup {
  id          String               @id @default(uuid()) @db.Uuid
  code        String               @unique
  name        String
  description String?
  sortOrder   Int                  @default(0) @map("sort_order")
  isActive    Boolean              @default(true) @map("is_active")
  usages      PropertyUsageLookup[]
  feeFixings  FeeFixingBylaw[]
  createdAt   DateTime             @default(now()) @map("created_at")
  updatedAt   DateTime             @updatedAt @map("updated_at")
  @@map("property_type_lookups")
}

model PropertyUsageLookup {
  id             String             @id @default(uuid()) @db.Uuid
  propertyTypeId String             @map("property_type_id") @db.Uuid
  code           String             @unique
  name           String
  description    String?
  sortOrder      Int                @default(0) @map("sort_order")
  isActive       Boolean            @default(true) @map("is_active")
  propertyType   PropertyTypeLookup @relation(fields: [propertyTypeId], references: [id], onDelete: Restrict)
  feeFixings     FeeFixingBylaw[]
  createdAt      DateTime           @default(now()) @map("created_at")
  updatedAt      DateTime           @updatedAt @map("updated_at")
  @@index([propertyTypeId])
  @@map("property_usage_lookups")
}

model FeeFixingBylaw {
  id              String              @id @default(uuid()) @db.Uuid
  assemblyId      String              @map("assembly_id") @db.Uuid
  fiscalYear      Int                 @map("fiscal_year")
  propertyTypeId  String              @map("property_type_id") @db.Uuid
  propertyUsageId String              @map("property_usage_id") @db.Uuid
  baseRate        Decimal             @db.Decimal(12, 2) @map("base_rate")
  rateImpost      Decimal             @db.Decimal(5, 4) @map("rate_impost")
  currency        String              @default("GHS")
  isActive        Boolean             @default(true) @map("is_active")
  assembly        Assembly            @relation(fields: [assemblyId], references: [id], onDelete: Restrict)
  propertyType    PropertyTypeLookup  @relation(fields: [propertyTypeId], references: [id], onDelete: Restrict)
  propertyUsage   PropertyUsageLookup @relation(fields: [propertyUsageId], references: [id], onDelete: Restrict)
  createdAt       DateTime            @default(now()) @map("created_at")
  updatedAt       DateTime            @updatedAt @map("updated_at")
  @@unique([assemblyId, fiscalYear, propertyTypeId, propertyUsageId])
  @@index([assemblyId, fiscalYear])
  @@map("fee_fixing_bylaws")
}

`PropertyTypeLookup.code` and `PropertyUsageLookup.code` MUST match the PropertyType and
PropertyUsage enum values in property-service. `rateImpost` is a fraction
(0.1500 = 15%).

6.11 gis-service (gis_spatial_db)
Assembly-scoped spatial hierarchy for map rendering and field-agent navigation.

prisma
// + [Include 4 Standard Models Here]
model SpatialZone {
  id                  String         @id @default(uuid()) @db.Uuid
  concessionId        String         @map("concession_id") @db.Uuid
  assemblyId          String         @map("assembly_id") @db.Uuid
  zoneCode            String         @map("zone_code")
  zoneName            String         @map("zone_name")
  boundaryCoordinates Json?          @map("boundary_coordinates")
  centroidLatitude    Float?         @db.DoublePrecision @map("centroid_latitude")
  centroidLongitude   Float?         @db.DoublePrecision @map("centroid_longitude")
  isActive            Boolean        @default(true) @map("is_active")
  blocks              SpatialBlock[]
  createdAt           DateTime       @default(now()) @map("created_at")
  updatedAt           DateTime       @updatedAt @map("updated_at")
  @@unique([concessionId, assemblyId, zoneCode])
  @@map("spatial_zones")
}

model SpatialBlock {
  id                  String      @id @default(uuid()) @db.Uuid
  concessionId        String      @map("concession_id") @db.Uuid
  assemblyId          String      @map("assembly_id") @db.Uuid
  zoneId              String      @map("zone_id") @db.Uuid
  blockCode           String      @map("block_code")
  boundaryCoordinates Json        @map("boundary_coordinates")
  centroidLatitude    Float?      @db.DoublePrecision @map("centroid_latitude")
  centroidLongitude   Float?      @db.DoublePrecision @map("centroid_longitude")
  isActive            Boolean     @default(true) @map("is_active")
  zone                SpatialZone @relation(fields: [zoneId], references: [id], onDelete: Cascade)
  createdAt           DateTime    @default(now()) @map("created_at")
  updatedAt           DateTime    @updatedAt @map("updated_at")
  @@unique([zoneId, blockCode])
  @@map("spatial_blocks")
}

7. Event Flows & Synchronization
A. Downstream Sync (CROIP → iDARMS)
Frontend creates a Ratepayer via CROIP API.

CROIP saves the master record and emits croip.ratepayer.registered.v1 to croip.events.

croip-integration-service Inbox catches the event, verifies the concessionId, and publishes it to the local idarms.events exchange.

ratepayer-service Inbox catches it and upserts the record into idarms_ratepayer_db.

B. Local Operational Loop (iDARMS Internal)
Verify: Field agent verifies property locally. property-service updates DB and emits property.verified.v1.

Valuation: valuation-service Inbox catches it, updates replica, calculates value, emits property.valuation_completed.v1.

Fee fixing: concessions-management-service publishes fee_fixing.published.v1; billing-service replicates the bylaw (FeeFixingReplica) and applies it on the next valuation.

Billing: billing-service Inbox catches it, updates replica, applies the active fee-fixing bylaw, generates bill, emits bill.issued.v1.

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

Create infra/docker/docker-compose.yml containing PostgreSQL (with an init script to create 11 databases) and RabbitMQ.

Scaffold the 11 services/* folders using the Golden Template(golden_template.md) in this same directory. Scaffold apps/idarms-portal (Next.js).

Phase 2: Frontend & Master Data Routing (CQRS)
Build the Next.js RatepayerForm. Wire it to POST https://api.croip.gov.gh/v1/identity/ratepayers.

Build the Next.js RatepayerList. Wire it to GET http://localhost:8080/api/v1/ratepayers.

Build ratepayer-service and property-service. Implement their Inbox Workers to sync down from croip-integration-service.

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

