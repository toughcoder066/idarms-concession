-- CreateSchema
CREATE SCHEMA IF NOT EXISTS "public";

-- CreateTable
CREATE TABLE "outbox_events" (
    "id" UUID NOT NULL,
    "eventType" TEXT NOT NULL,
    "eventVersion" INTEGER NOT NULL DEFAULT 1,
    "aggregateType" TEXT NOT NULL,
    "aggregateId" TEXT NOT NULL,
    "aggregateVersion" INTEGER NOT NULL,
    "routingKey" TEXT NOT NULL,
    "payload" JSONB NOT NULL,
    "headers" JSONB NOT NULL,
    "occurredAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "publishedAt" TIMESTAMP(3),
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "nextAttemptAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lockedAt" TIMESTAMP(3),
    "lastError" TEXT,

    CONSTRAINT "outbox_events_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "inbox_messages" (
    "id" UUID NOT NULL,
    "consumerId" TEXT NOT NULL,
    "messageId" UUID NOT NULL,
    "eventType" TEXT NOT NULL,
    "receivedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "processedAt" TIMESTAMP(3),
    "result" JSONB,

    CONSTRAINT "inbox_messages_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "audit_records" (
    "id" UUID NOT NULL,
    "occurredAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "actorId" TEXT NOT NULL,
    "actorType" TEXT NOT NULL,
    "concessionId" UUID,
    "assemblyId" UUID,
    "action" TEXT NOT NULL,
    "resourceType" TEXT NOT NULL,
    "resourceId" TEXT,
    "requestId" TEXT NOT NULL,
    "sourceIp" TEXT,
    "outcome" TEXT NOT NULL,
    "metadata" JSONB NOT NULL,

    CONSTRAINT "audit_records_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "idempotency_records" (
    "id" UUID NOT NULL,
    "concessionId" UUID NOT NULL,
    "idempotencyKey" TEXT NOT NULL,
    "requestHash" TEXT NOT NULL,
    "responseStatus" INTEGER,
    "responseBody" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expiresAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "idempotency_records_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "concession_contracts" (
    "id" UUID NOT NULL,
    "concession_code" TEXT NOT NULL,
    "concession_name" TEXT NOT NULL,
    "state_revenue_share" DECIMAL(5,2) NOT NULL,
    "concessionaire_share" DECIMAL(5,2) NOT NULL,
    "start_date" TIMESTAMP(3) NOT NULL,
    "end_date" TIMESTAMP(3) NOT NULL,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "concession_contracts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "assemblies" (
    "id" UUID NOT NULL,
    "assembly_code" TEXT NOT NULL,
    "assembly_name" TEXT NOT NULL,
    "region" TEXT NOT NULL,
    "prefix_rules" TEXT[],
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "assemblies_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "concession_assemblies" (
    "id" UUID NOT NULL,
    "concession_id" UUID NOT NULL,
    "assembly_id" UUID NOT NULL,
    "assigned_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "concession_assemblies_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "property_type_lookups" (
    "id" UUID NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "sort_order" INTEGER NOT NULL DEFAULT 0,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "property_type_lookups_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "property_usage_lookups" (
    "id" UUID NOT NULL,
    "property_type_id" UUID NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "sort_order" INTEGER NOT NULL DEFAULT 0,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "property_usage_lookups_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "fee_fixing_bylaws" (
    "id" UUID NOT NULL,
    "assembly_id" UUID NOT NULL,
    "fiscal_year" INTEGER NOT NULL,
    "property_type_id" UUID NOT NULL,
    "property_usage_id" UUID NOT NULL,
    "base_rate" DECIMAL(12,2) NOT NULL,
    "rate_impost" DECIMAL(5,4) NOT NULL,
    "currency" TEXT NOT NULL DEFAULT 'GHS',
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "fee_fixing_bylaws_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "outbox_events_publishedAt_nextAttemptAt_occurredAt_idx" ON "outbox_events"("publishedAt", "nextAttemptAt", "occurredAt");

-- CreateIndex
CREATE UNIQUE INDEX "inbox_messages_consumerId_messageId_key" ON "inbox_messages"("consumerId", "messageId");

-- CreateIndex
CREATE INDEX "audit_records_concessionId_assemblyId_occurredAt_idx" ON "audit_records"("concessionId", "assemblyId", "occurredAt");

-- CreateIndex
CREATE UNIQUE INDEX "idempotency_records_concessionId_idempotencyKey_key" ON "idempotency_records"("concessionId", "idempotencyKey");

-- CreateIndex
CREATE UNIQUE INDEX "concession_contracts_concession_code_key" ON "concession_contracts"("concession_code");

-- CreateIndex
CREATE INDEX "concession_contracts_is_active_idx" ON "concession_contracts"("is_active");

-- CreateIndex
CREATE UNIQUE INDEX "assemblies_assembly_code_key" ON "assemblies"("assembly_code");

-- CreateIndex
CREATE INDEX "assemblies_region_idx" ON "assemblies"("region");

-- CreateIndex
CREATE INDEX "concession_assemblies_assembly_id_idx" ON "concession_assemblies"("assembly_id");

-- CreateIndex
CREATE UNIQUE INDEX "concession_assemblies_concession_id_assembly_id_key" ON "concession_assemblies"("concession_id", "assembly_id");

-- CreateIndex
CREATE UNIQUE INDEX "property_type_lookups_code_key" ON "property_type_lookups"("code");

-- CreateIndex
CREATE UNIQUE INDEX "property_usage_lookups_code_key" ON "property_usage_lookups"("code");

-- CreateIndex
CREATE INDEX "property_usage_lookups_property_type_id_idx" ON "property_usage_lookups"("property_type_id");

-- CreateIndex
CREATE INDEX "fee_fixing_bylaws_assembly_id_fiscal_year_idx" ON "fee_fixing_bylaws"("assembly_id", "fiscal_year");

-- CreateIndex
CREATE UNIQUE INDEX "fee_fixing_bylaws_assembly_id_fiscal_year_property_type_id__key" ON "fee_fixing_bylaws"("assembly_id", "fiscal_year", "property_type_id", "property_usage_id");

-- AddForeignKey
ALTER TABLE "concession_assemblies" ADD CONSTRAINT "concession_assemblies_concession_id_fkey" FOREIGN KEY ("concession_id") REFERENCES "concession_contracts"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "concession_assemblies" ADD CONSTRAINT "concession_assemblies_assembly_id_fkey" FOREIGN KEY ("assembly_id") REFERENCES "assemblies"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "property_usage_lookups" ADD CONSTRAINT "property_usage_lookups_property_type_id_fkey" FOREIGN KEY ("property_type_id") REFERENCES "property_type_lookups"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "fee_fixing_bylaws" ADD CONSTRAINT "fee_fixing_bylaws_assembly_id_fkey" FOREIGN KEY ("assembly_id") REFERENCES "assemblies"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "fee_fixing_bylaws" ADD CONSTRAINT "fee_fixing_bylaws_property_type_id_fkey" FOREIGN KEY ("property_type_id") REFERENCES "property_type_lookups"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "fee_fixing_bylaws" ADD CONSTRAINT "fee_fixing_bylaws_property_usage_id_fkey" FOREIGN KEY ("property_usage_id") REFERENCES "property_usage_lookups"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
