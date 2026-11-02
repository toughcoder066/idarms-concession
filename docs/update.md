Property Scope Shift: Renamed from "Registry" to property-service to accurately reflect that iDARMS maintains an operational concessionaire portfolio/inventory rather than acting as the national master registry.

Zero-Blocking File Handling: Heavy files (photos, land titles) bypass application servers entirely via the Presigned URL Pattern, utilizing a polymorphic Documents Service.

2. Core Microservices & Database Schemas (Prisma / PostgreSQL)
A. Concession Management Service (concession_mgmt_db)
Manages formal concession contracts, multi-assembly jurisdictions, and annual fee-fixing bylaws.

Code snippet
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

  @@map("concession_contracts")
}

model Assembly {
  id           String               @id @default(uuid()) @db.Uuid
  assemblyCode String               @unique @map("assembly_code") // e.g., "AMA", "KMA"
  assemblyName String               @map("assembly_name")
  region       String
  prefixRules  String[]             @map("prefix_rules")          // e.g., ["GA", "GW"] for GhanaPost validation
  concessions  ConcessionAssembly[]
  feeFixings   FeeFixingBylaw[]
  createdAt    DateTime             @default(now()) @map("created_at")

  @@map("assemblies")
}

model ConcessionAssembly {
  id           String             @id @default(uuid()) @db.Uuid
  concessionId String             @db.Uuid @map("concession_id")
  assemblyId   String             @db.Uuid @map("assembly_id")
  contract     ConcessionContract @relation(fields: [concessionId], references: [id])
  assembly     Assembly           @relation(fields: [assemblyId], references: [id])
  assignedAt   DateTime           @default(now()) @map("assigned_at")

  @@unique([concessionId, assemblyId])
  @@map("concession_assemblies")
}

/// System-wide master classification categories (e.g., RESIDENTIAL, COMMERCIAL, INDUSTRIAL)
model PropertyTypeLookup {
  id          String               @id @default(uuid()) @db.Uuid
  code        String               @unique // Unique string key, e.g., "COMMERCIAL", "RESIDENTIAL"
  name        String                       // Display name, e.g., "Commercial Property"
  description String?
  isActive    Boolean              @default(true) @map("is_active")
  usages      PropertyUsageLookup[]
  feeFixings  FeeFixingBylaw[]
  createdAt   DateTime             @default(now()) @map("created_at")

  @@map("property_type_lookups")
}

/// Granular property usage subtypes linked to a parent property type
model PropertyUsageLookup {
  id             String             @id @default(uuid()) @db.Uuid
  propertyTypeId String             @db.Uuid @map("property_type_id")
  code           String             @unique // Unique string key, e.g., "RETAIL_SHOP", "BANK_BRANCH"
  name           String                     // Display name, e.g., "Retail Shop / Store"
  description    String?
  isActive       Boolean            @default(true) @map("is_active")
  propertyType   PropertyTypeLookup @relation(fields: [propertyTypeId], references: [id])
  feeFixings     FeeFixingBylaw[]
  createdAt      DateTime           @default(now()) @map("created_at")

  @@index([propertyTypeId])
  @@map("property_usage_lookups")
}

/// Annual rate impost rules configured per Assembly, Type, and Usage
model FeeFixingBylaw {
  id              String              @id @default(uuid()) @db.Uuid
  assemblyId      String              @db.Uuid @map("assembly_id")
  fiscalYear      Int                 @map("fiscal_year")
  
  // Foreign keys linking to local classification lookup tables
  propertyTypeId  String              @db.Uuid @map("property_type_id")
  propertyUsageId String              @db.Uuid @map("property_usage_id")
  
  baseRate        Decimal             @db.Decimal(12, 2) @map("base_rate")
  rateImpost      Decimal             @db.Decimal(5, 4)  @map("rate_impost")
  
  assembly        Assembly            @relation(fields: [assemblyId], references: [id])
  propertyType    PropertyTypeLookup  @relation(fields: [propertyTypeId], references: [id])
  propertyUsage   PropertyUsageLookup @relation(fields: [propertyUsageId], references: [id])

  @@unique([assemblyId, fiscalYear, propertyTypeId, propertyUsageId])
  @@map("fee_fixing_bylaws")
}

B. Property Service (idarms_property_db)
Maintains physical property metadata, dual identifiers, GIS spatial references, and verification audit states, keeping temporal financial calculations and file binaries entirely decoupled.

Code snippet
model Property {
  id                 String             @id @default(uuid()) @db.Uuid
  croipPropertyId    String?            @unique @map("croip_property_id") @db.Uuid
  externalPropertyId String             @map("external_property_id")

  concessionId       String             @map("concession_id") @db.Uuid
  assemblyId         String             @map("assembly_id") @db.Uuid
  ratepayerRef       String?            @map("ratepayer_ref")

  digitalAddress     String?            @map("digital_address") @db.VarChar(15)
  zoneCode           String?            @map("zone_code")
  blockCode          String?            @map("block_code")
  addressText        String?            @map("address_text")
  latitude           Float?             @db.DoublePrecision
  longitude          Float?             @db.DoublePrecision

  propertyType       PropertyType       @default(UNCLASSIFIED) @map("property_type")
  propertyUsage      PropertyUsage      @default(GENERAL)      @map("property_usage")
  ratableValue       Decimal?           @default(0.00) @map("ratable_value") @db.Decimal(14, 2)

  status             PropertyStatus     @default(SUBMITTED)
  registrationSource RegistrationSource @default(MOBILE_FIELD_APP) @map("registration_source")
  isBillGenerated    Boolean            @default(false) @map("is_bill_generated")

  registeredBy       String             @map("registered_by") @db.Uuid
  verifiedBy         String?            @map("verified_by") @db.Uuid
  verifiedAt         DateTime?          @map("verified_at")

  createdAt          DateTime           @default(now()) @map("created_at")
  updatedAt          DateTime           @updatedAt @map("updated_at")
  lastSyncedAt       DateTime?          @map("last_synced_at") // Tracks upward sync to CROIP
  version            Int                @default(1)

  @@unique([concessionId, externalPropertyId])
  @@index([concessionId, assemblyId, status])
  @@index([digitalAddress])
  @@index([ratepayerRef])
  @@index([zoneCode, blockCode])
  @@map("properties")
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
C. GIS Spatial Service (gis_spatial_db)
Handles spatial hierarchies, zones, and blocks to support map rendering and agent navigation.

Code snippet
model SpatialZone {
  id           String         @id @default(uuid()) @db.Uuid
  assemblyId   String         @db.Uuid @map("assembly_id")
  zoneCode     String         @map("zone_code")
  zoneName     String         @map("zone_name")
  blocks       SpatialBlock[]
  createdAt    DateTime       @default(now()) @map("created_at")

  @@unique([assemblyId, zoneCode])
  @@map("spatial_zones")
}

model SpatialBlock {
  id                  String      @id @default(uuid()) @db.Uuid
  zoneId              String      @db.Uuid @map("zone_id")
  blockCode           String      @map("block_code")
  boundaryCoordinates Json        @map("boundary_coordinates") // GeoJSON Polygon
  zone                SpatialZone @relation(fields: [zoneId], references: [id], onDelete: Cascade)
  createdAt           DateTime    @default(now()) @map("created_at")

  @@unique([zoneId, blockCode])
  @@map("spatial_blocks")
}
D. Billing Service (billing_db)
Computes and stores municipal bills decoupled from property records, linked purely via propertyId.

Code snippet
model Bill {
  id             String      @id @default(uuid()) @db.Uuid
  billNumber     String      @unique @map("bill_number")
  propertyId     String      @db.Uuid @map("property_id")
  fiscalYear     Int         @map("fiscal_year")
  baseRate       Decimal     @db.Decimal(12, 2) @map("base_rate")
  rateImpost     Decimal     @db.Decimal(5, 4)  @map("rate_impost")
  subTotal       Decimal     @db.Decimal(12, 2) @map("sub_total")
  penaltyAmount  Decimal     @default(0.00) @db.Decimal(12, 2) @map("penalty_amount")
  discountAmount Decimal     @default(0.00) @db.Decimal(12, 2) @map("discount_amount")
  totalAmount    Decimal     @db.Decimal(12, 2) @map("total_amount")
  amountPaid     Decimal     @default(0.00) @db.Decimal(12, 2) @map("amount_paid")
  status         BillStatus  @default(UNPAID)
  issuedAt       DateTime    @default(now()) @map("issued_at")
  dueDate        DateTime    @map("due_date")
  updatedAt      DateTime    @updatedAt @map("updated_at")

  @@unique([propertyId, fiscalYear])
  @@index([status, dueDate])
  @@map("bills")
}

enum BillStatus {
  UNPAID
  PARTIALLY_PAID
  PAID
  OVERDUE
  CANCELLED
}
E. Documents Service (documents_db)
Stores file metadata and object storage paths, linking dynamically to any entity using a polymorphic approach.

Code snippet
model DocumentRecord {
  id           String     @id @default(uuid()) @db.Uuid
  concessionId String     @db.Uuid @map("concession_id")
  entityId     String     @db.Uuid @map("entity_id")       // Property UUID or Ratepayer UUID
  entityType   EntityType @map("entity_type")
  documentType String     @map("document_type")           // PHOTO, BUILDING_PERMIT, LAND_TITLE, ID_CARD
  fileUrl      String     @map("file_url")                // S3 / MinIO object path
  fileName     String     @map("file_name")
  fileSize     Int        @map("file_size")
  uploadedBy   String     @map("uploaded_by")             // Agent UUID
  createdAt    DateTime   @default(now()) @map("created_at")

  @@index([entityId, entityType])
  @@map("document_records")
}

enum EntityType {
  PROPERTY
  RATEPAYER
  BILL
  PAYMENT
}
F. Payment Service (payment_db)
Handles provider-agnostic transactions with an extensible payment gateway adapter pattern.

Code snippet
model PaymentTransaction {
  id                 String            @id @default(uuid()) @db.Uuid
  reference          String            @unique
  externalReference  String?           @unique @map("external_reference")
  billId             String            @db.Uuid @map("bill_id")
  propertyId         String            @db.Uuid @map("property_id")
  concessionId       String            @db.Uuid @map("concession_id")
  assemblyId         String            @db.Uuid @map("assembly_id")
  amount             Decimal           @db.Decimal(12, 2)
  channel            PaymentChannel    @map("channel")
  provider           String            @default("PAYSTACK")
  status             PaymentStatus     @default(PENDING)
  payerPhone         String?           @map("payer_phone")
  payerEmail         String?           @map("payer_email")
  rawGatewayResponse Json?             @map("raw_gateway_response")
  paidAt             DateTime?         @map("paid_at")
  createdAt          DateTime          @default(now()) @map("created_at")

  @@index([concessionId, status])
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
}
3. Core Operational Workflows
GhanaPost Prefix Validation:

Incoming digital addresses are validated via Zod regex rules against the selected municipal assembly's approved prefix array (e.g., ensuring GA prefixes match Accra Metropolitan Assembly). If mismatched, the API throws a 400 Bad Request.

Presigned URL Document Upload:

Field agents submit property forms in one seamless click. Under the hood, the mobile app requests temporary S3 presigned URLs from the Documents Service, uploads heavy binaries directly to object storage, and submits lightweight metadata and documentIds to the Property Service.

Decoupled Billing & Assessment:

Verified properties trigger billing calculations. The Billing Service fetches property attributes, looks up the assembly's fee-fixing bylaws for the active fiscal year, generates a human-readable bill number, and dispatches events upward to the CROIP Integration Service.

Pluggable Payments:

Transactions flow through an abstract IPaymentGateway interface. Switching from Paystack to alternative providers requires implementing the adapter interface without altering core billing or ledger logic.