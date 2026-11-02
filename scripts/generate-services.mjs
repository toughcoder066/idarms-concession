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
    name: 'property-service',
    package: '@idarms/property-service',
    port: 3010,
    db: 'idarms_property_db',
    moduleName: 'properties',
    modelKey: 'property',
    readPermission: 'property:read',
    routePrefix: '/v1/properties',
    routeTag: 'properties',
    permissions: ['property:read', 'property:create', 'property:verify', 'property:update'],
    consumedRoutingKeys: ['property.registered.v1', 'bill.issued.v1'],
    publishedEvents: ['property.verified.v1'],
    listWhere: '{ concessionId: scope.concessionId, assemblyId: scope.assemblyId }',
    getWhere: '{ id, concessionId: scope.concessionId, assemblyId: scope.assemblyId }',
    domainModels: `
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

  registeredBy       String             @map("registered_by") @db.Uuid
  verifiedBy         String?            @map("verified_by") @db.Uuid
  verifiedAt         DateTime?          @map("verified_at")

  createdAt          DateTime           @default(now()) @map("created_at")
  updatedAt          DateTime           @updatedAt @map("updated_at")
  lastSyncedAt       DateTime?          @map("last_synced_at")
  version            Int                @default(1)

  verifications      FieldVerification[]

  @@unique([concessionId, externalPropertyId])
  @@index([concessionId, assemblyId, status])
  @@index([concessionId, assemblyId, propertyType])
  @@index([digitalAddress])
  @@index([ratepayerRef])
  @@index([zoneCode, blockCode])
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

enum PropertyType {
  UNCLASSIFIED
  RESIDENTIAL
  COMMERCIAL
  INDUSTRIAL
  MIXED_USE
  GOVERNMENTAL
  AGRICULTURAL
}

enum PropertyUsage {
  GENERAL
  SHOP
  OFFICE
  APARTMENT
  SINGLE_FAMILY_HOUSE
  WAREHOUSE
  FACTORY
  HOTEL_LODGING
  EDUCATIONAL
  FILLING_STATION
}

enum PropertyStatus {
  SUBMITTED
  VERIFIED
  DISPUTED
  ARCHIVED
}

enum RegistrationSource {
  WALK_IN_DESK
  MOBILE_FIELD_APP
  BULK_IMPORT
  CROIP_SYNC
}

enum VerificationState {
  APPROVED
  REJECTED
  NEEDS_CORRECTION
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
  @@index([uploadStatus])
  @@map("documents")
}

enum EntityType {
  PROPERTY
  RATEPAYER
  BILL
  PAYMENT
}

enum UploadStatus {
  PENDING_UPLOAD
  UPLOADED
  FAILED
  DELETED
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
  id            String   @id @db.Uuid
  concessionId  String   @db.Uuid @map("concession_id")
  assemblyId    String   @db.Uuid @map("assembly_id")
  propertyType  String   @map("property_type")
  propertyUsage String   @default("GENERAL") @map("property_usage")
  status        String
  lastSyncedAt  DateTime @default(now()) @map("last_synced_at")

  @@index([concessionId, assemblyId, status])
  @@map("property_replicas")
}

model Valuation {
  id            String   @id @default(uuid()) @db.Uuid
  concessionId  String   @db.Uuid @map("concession_id")
  assemblyId    String   @db.Uuid @map("assembly_id")
  propertyId    String   @unique @db.Uuid @map("property_id")
  propertyType  String   @map("property_type")
  propertyUsage String   @default("GENERAL") @map("property_usage")
  marketValue   Decimal  @db.Decimal(14, 2) @map("market_value")
  taxableValue  Decimal  @db.Decimal(14, 2) @map("taxable_value")
  fiscalYear    Int      @map("fiscal_year")
  basis         String?
  createdAt     DateTime @default(now()) @map("created_at")
  updatedAt     DateTime @updatedAt @map("updated_at")

  @@index([concessionId, assemblyId, fiscalYear])
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
    consumedRoutingKeys: ['property.valuation_completed.v1', 'fee_fixing.published.v1'],
    publishedEvents: ['bill.issued.v1'],
    listWhere: '{ concessionId: scope.concessionId, assemblyId: scope.assemblyId }',
    getWhere: '{ id, concessionId: scope.concessionId, assemblyId: scope.assemblyId }',
    domainModels: `
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

  @@index([concessionId, assemblyId, fiscalYear])
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
  @@index([assemblyId, fiscalYear])
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
  @@index([status, dueDate])
  @@map("bills")
}

enum BillStatus {
  UNPAID
  PARTIALLY_PAID
  PAID
  OVERDUE
  CANCELLED
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

  @@index([concessionId, assemblyId, status])
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
  @@index([billId])
  @@map("payment_transactions")
}

enum PaymentChannel {
  MOBILE_MONEY
  BANK_CARD
  POS_TERMINAL
  CASH_DESK
}

enum PaymentStatus {
  PENDING
  SUCCESS
  FAILED
  REVERSED
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
  id           String   @id @db.Uuid
  concessionId String   @db.Uuid @map("concession_id")
  assemblyId   String   @db.Uuid @map("assembly_id")
  propertyId   String   @db.Uuid @map("property_id")
  fiscalYear   Int      @map("fiscal_year")
  totalAmount  Decimal  @db.Decimal(12, 2) @map("total_amount")
  amountPaid   Decimal  @default(0.00) @db.Decimal(12, 2) @map("amount_paid")
  currency     String   @default("GHS")
  status       String
  syncedAt     DateTime @default(now()) @map("synced_at")

  @@index([concessionId, assemblyId, status])
  @@map("bill_replicas")
}

model PaymentReplica {
  id           String   @id @db.Uuid
  concessionId String   @db.Uuid @map("concession_id")
  assemblyId   String   @db.Uuid @map("assembly_id")
  billId       String   @db.Uuid @map("bill_id")
  amount       Decimal  @db.Decimal(12, 2)
  currency     String   @default("GHS")
  status       String
  syncedAt     DateTime @default(now()) @map("synced_at")

  @@index([concessionId, assemblyId, status])
  @@map("payment_replicas")
}

model Discrepancy {
  id           String            @id @default(uuid()) @db.Uuid
  concessionId String            @db.Uuid @map("concession_id")
  assemblyId   String            @db.Uuid @map("assembly_id")
  billId       String            @db.Uuid @map("bill_id")
  paymentId    String            @db.Uuid @map("payment_id")
  reason       DiscrepancyReason
  resolved     Boolean           @default(false)
  resolvedAt   DateTime?         @map("resolved_at")
  createdAt    DateTime          @default(now()) @map("created_at")

  @@unique([billId, paymentId, reason])
  @@index([concessionId, assemblyId, resolved])
  @@map("discrepancies")
}

enum DiscrepancyReason {
  AMOUNT_MISMATCH
  UNMATCHED_PAYMENT
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
  concessionId       String   @db.Uuid @map("concession_id")
  assemblyId         String   @db.Uuid @map("assembly_id")
  date               DateTime @db.Date
  currency           String   @default("GHS")
  totalBilled        Decimal  @db.Decimal(14, 2) @default(0) @map("total_billed")
  totalCollected     Decimal  @db.Decimal(14, 2) @default(0) @map("total_collected")
  propertiesVerified Int      @default(0) @map("properties_verified")

  @@unique([concessionId, assemblyId, date])
  @@index([concessionId, assemblyId])
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
  entityType     String   // PROPERTY, RATEPAYER, BILL, PAYMENT, CONCESSION
  entityId       String   @db.Uuid
  direction      String   // UPSTREAM, DOWNSTREAM
  status         String   // SYNCED, PENDING, FAILED
  croipReference String?
  lastSyncedAt   DateTime @default(now())

  @@unique([entityType, entityId, direction])
  @@index([entityType, direction, status])
  @@map("sync_records")
}`,
  },
  {
    name: 'concessions-management-service',
    package: '@idarms/concessions-management-service',
    port: 3100,
    db: 'concession_mgmt_db',
    moduleName: 'concessions',
    modelKey: 'concessionContract',
    readPermission: 'concession:read',
    routePrefix: '/v1/concessions',
    routeTag: 'concessions',
    permissions: ['concession:read', 'concession:manage'],
    consumedRoutingKeys: [],
    publishedEvents: ['fee_fixing.published.v1'],
    listWhere: '{ id: scope.concessionId }',
    getWhere: '{ id }',
    domainModels: `
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

  @@index([isActive])
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

  @@index([region])
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
  @@index([assemblyId])
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
}`,
  },
  {
    name: 'gis-service',
    package: '@idarms/gis-service',
    port: 3110,
    db: 'gis_spatial_db',
    moduleName: 'zones',
    modelKey: 'spatialZone',
    readPermission: 'gis:read',
    routePrefix: '/v1/zones',
    routeTag: 'zones',
    permissions: ['gis:read', 'gis:manage'],
    consumedRoutingKeys: [],
    publishedEvents: [],
    listWhere: '{ concessionId: scope.concessionId, assemblyId: scope.assemblyId }',
    getWhere: '{ id, concessionId: scope.concessionId, assemblyId: scope.assemblyId }',
    domainModels: `
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
  @@index([concessionId, assemblyId])
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
  @@index([concessionId, assemblyId])
  @@map("spatial_blocks")
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

const onlyArg = process.argv.find((arg) => arg.startsWith('--only='));
const only = onlyArg
  ? new Set(onlyArg.slice('--only='.length).split(',').map((name) => name.trim()).filter(Boolean))
  : null;

if (only) {
  const unknown = [...only].filter((name) => !services.some((svc) => svc.name === name));
  if (unknown.length > 0) {
    throw new Error(`Unknown service(s): ${unknown.join(', ')}`);
  }
}

let generated = 0;
for (const svc of services) {
  if (only && !only.has(svc.name)) continue;
  generateService(svc);
  generated += 1;
}

console.log(`Done. Generated ${generated} service(s) in ${servicesDir}`);
