-- Add tenancy, usage classification and audit columns to valuations.

ALTER TABLE "property_replicas" RENAME COLUMN "assemblyId" TO "assembly_id";
ALTER TABLE "property_replicas" RENAME COLUMN "propertyType" TO "property_type";
ALTER TABLE "property_replicas"
  ADD COLUMN "concession_id" UUID NOT NULL DEFAULT '00000000-0000-0000-0000-000000000000',
  ADD COLUMN "property_usage" TEXT NOT NULL DEFAULT 'GENERAL',
  ADD COLUMN "last_synced_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;
ALTER TABLE "property_replicas" ALTER COLUMN "concession_id" DROP DEFAULT;
CREATE INDEX "property_replicas_concession_id_assembly_id_status_idx" ON "property_replicas"("concession_id", "assembly_id", "status");

ALTER TABLE "valuations" RENAME COLUMN "propertyId" TO "property_id";
ALTER TABLE "valuations" RENAME COLUMN "assemblyId" TO "assembly_id";
ALTER TABLE "valuations" RENAME COLUMN "marketValue" TO "market_value";
ALTER TABLE "valuations" RENAME COLUMN "taxableValue" TO "taxable_value";
ALTER TABLE "valuations" RENAME COLUMN "fiscalYear" TO "fiscal_year";
ALTER TABLE "valuations" RENAME COLUMN "createdAt" TO "created_at";
ALTER TABLE "valuations"
  ADD COLUMN "concession_id" UUID NOT NULL DEFAULT '00000000-0000-0000-0000-000000000000',
  ADD COLUMN "property_type" TEXT NOT NULL DEFAULT 'UNCLASSIFIED',
  ADD COLUMN "property_usage" TEXT NOT NULL DEFAULT 'GENERAL',
  ADD COLUMN "basis" TEXT,
  ADD COLUMN "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;
ALTER TABLE "valuations" ALTER COLUMN "concession_id" DROP DEFAULT;
ALTER TABLE "valuations" ALTER COLUMN "market_value" TYPE DECIMAL(14,2);
ALTER TABLE "valuations" ALTER COLUMN "taxable_value" TYPE DECIMAL(14,2);
CREATE INDEX "valuations_concession_id_assembly_id_fiscal_year_idx" ON "valuations"("concession_id", "assembly_id", "fiscal_year");
