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
CREATE TABLE "spatial_zones" (
    "id" UUID NOT NULL,
    "concession_id" UUID NOT NULL,
    "assembly_id" UUID NOT NULL,
    "zone_code" TEXT NOT NULL,
    "zone_name" TEXT NOT NULL,
    "boundary_coordinates" JSONB,
    "centroid_latitude" DOUBLE PRECISION,
    "centroid_longitude" DOUBLE PRECISION,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "spatial_zones_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "spatial_blocks" (
    "id" UUID NOT NULL,
    "concession_id" UUID NOT NULL,
    "assembly_id" UUID NOT NULL,
    "zone_id" UUID NOT NULL,
    "block_code" TEXT NOT NULL,
    "boundary_coordinates" JSONB NOT NULL,
    "centroid_latitude" DOUBLE PRECISION,
    "centroid_longitude" DOUBLE PRECISION,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "spatial_blocks_pkey" PRIMARY KEY ("id")
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
CREATE INDEX "spatial_zones_concession_id_assembly_id_idx" ON "spatial_zones"("concession_id", "assembly_id");

-- CreateIndex
CREATE UNIQUE INDEX "spatial_zones_concession_id_assembly_id_zone_code_key" ON "spatial_zones"("concession_id", "assembly_id", "zone_code");

-- CreateIndex
CREATE INDEX "spatial_blocks_concession_id_assembly_id_idx" ON "spatial_blocks"("concession_id", "assembly_id");

-- CreateIndex
CREATE UNIQUE INDEX "spatial_blocks_zone_id_block_code_key" ON "spatial_blocks"("zone_id", "block_code");

-- AddForeignKey
ALTER TABLE "spatial_blocks" ADD CONSTRAINT "spatial_blocks_zone_id_fkey" FOREIGN KEY ("zone_id") REFERENCES "spatial_zones"("id") ON DELETE CASCADE ON UPDATE CASCADE;
