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
CREATE TABLE "properties" (
    "id" UUID NOT NULL,
    "concessionId" UUID NOT NULL,
    "assemblyId" UUID NOT NULL,
    "reference" TEXT NOT NULL,
    "ratepayerId" UUID NOT NULL,
    "propertyType" TEXT NOT NULL,
    "gpsCoordinates" TEXT,
    "status" TEXT NOT NULL,
    "lastSyncedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "properties_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "field_verifications" (
    "id" UUID NOT NULL,
    "propertyId" UUID NOT NULL,
    "agentId" UUID NOT NULL,
    "status" TEXT NOT NULL,
    "notes" TEXT,
    "photoUrl" TEXT,
    "verifiedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "field_verifications_pkey" PRIMARY KEY ("id")
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
CREATE UNIQUE INDEX "properties_reference_key" ON "properties"("reference");

-- CreateIndex
CREATE INDEX "properties_concessionId_assemblyId_status_idx" ON "properties"("concessionId", "assemblyId", "status");

-- CreateIndex
CREATE INDEX "properties_concessionId_reference_idx" ON "properties"("concessionId", "reference");

-- CreateIndex
CREATE INDEX "field_verifications_propertyId_idx" ON "field_verifications"("propertyId");
