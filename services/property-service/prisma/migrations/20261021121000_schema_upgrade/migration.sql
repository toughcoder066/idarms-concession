-- Upgrade the operational property portfolio schema.
-- Legacy camelCase columns are renamed and existing values are preserved.

-- CreateEnum
CREATE TYPE "PropertyType" AS ENUM ('UNCLASSIFIED', 'RESIDENTIAL', 'COMMERCIAL', 'INDUSTRIAL', 'MIXED_USE', 'GOVERNMENTAL', 'AGRICULTURAL');
CREATE TYPE "PropertyUsage" AS ENUM ('GENERAL', 'SHOP', 'OFFICE', 'APARTMENT', 'SINGLE_FAMILY_HOUSE', 'WAREHOUSE', 'FACTORY', 'HOTEL_LODGING', 'EDUCATIONAL', 'FILLING_STATION');
CREATE TYPE "PropertyStatus" AS ENUM ('SUBMITTED', 'VERIFIED', 'DISPUTED', 'ARCHIVED');
CREATE TYPE "RegistrationSource" AS ENUM ('WALK_IN_DESK', 'MOBILE_FIELD_APP', 'BULK_IMPORT', 'CROIP_SYNC');
CREATE TYPE "VerificationState" AS ENUM ('APPROVED', 'REJECTED', 'NEEDS_CORRECTION');

-- Rename legacy columns
ALTER TABLE "properties" RENAME COLUMN "concessionId" TO "concession_id";
ALTER TABLE "properties" RENAME COLUMN "assemblyId" TO "assembly_id";
ALTER TABLE "properties" RENAME COLUMN "reference" TO "external_property_id";
ALTER TABLE "properties" RENAME COLUMN "ratepayerId" TO "ratepayer_ref";
ALTER TABLE "properties" RENAME COLUMN "propertyType" TO "property_type";
ALTER TABLE "properties" RENAME COLUMN "lastSyncedAt" TO "last_synced_at";

ALTER TABLE "properties"
  ADD COLUMN "croip_property_id" UUID,
  ADD COLUMN "digital_address" VARCHAR(15),
  ADD COLUMN "zone_code" TEXT,
  ADD COLUMN "block_code" TEXT,
  ADD COLUMN "address_text" TEXT,
  ADD COLUMN "latitude" DOUBLE PRECISION,
  ADD COLUMN "longitude" DOUBLE PRECISION,
  ADD COLUMN "property_usage" "PropertyUsage" NOT NULL DEFAULT 'GENERAL',
  ADD COLUMN "ratable_value" DECIMAL(14,2) DEFAULT 0.00,
  ADD COLUMN "registration_source" "RegistrationSource" NOT NULL DEFAULT 'MOBILE_FIELD_APP',
  ADD COLUMN "is_bill_generated" BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN "document_ids" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
  ADD COLUMN "registered_by" UUID NOT NULL DEFAULT '00000000-0000-0000-0000-000000000000',
  ADD COLUMN "verified_by" UUID,
  ADD COLUMN "verified_at" TIMESTAMP(3),
  ADD COLUMN "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  ADD COLUMN "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  ADD COLUMN "version" INTEGER NOT NULL DEFAULT 1;

-- Preserve the CROIP identifier and legacy "lat,lng" strings.
UPDATE "properties" SET "croip_property_id" = "id";
UPDATE "properties"
SET "latitude" = split_part("gpsCoordinates", ',', 1)::DOUBLE PRECISION,
    "longitude" = split_part("gpsCoordinates", ',', 2)::DOUBLE PRECISION
WHERE "gpsCoordinates" ~ '^\s*-?[0-9]+(\.[0-9]+)?\s*,\s*-?[0-9]+(\.[0-9]+)?\s*$';

ALTER TABLE "properties" ALTER COLUMN "last_synced_at" DROP NOT NULL;
ALTER TABLE "properties" ALTER COLUMN "last_synced_at" DROP DEFAULT;

ALTER TABLE "properties"
  ALTER COLUMN "property_type" TYPE "PropertyType"
  USING (CASE UPPER(REPLACE("property_type", ' ', '_'))
    WHEN 'RESIDENTIAL' THEN 'RESIDENTIAL'::"PropertyType"
    WHEN 'COMMERCIAL' THEN 'COMMERCIAL'::"PropertyType"
    WHEN 'INDUSTRIAL' THEN 'INDUSTRIAL'::"PropertyType"
    WHEN 'MIXED_USE' THEN 'MIXED_USE'::"PropertyType"
    WHEN 'GOVERNMENTAL' THEN 'GOVERNMENTAL'::"PropertyType"
    WHEN 'AGRICULTURAL' THEN 'AGRICULTURAL'::"PropertyType"
    ELSE 'UNCLASSIFIED'::"PropertyType"
  END);

ALTER TABLE "properties"
  ALTER COLUMN "status" TYPE "PropertyStatus"
  USING (CASE UPPER("status")
    WHEN 'VERIFIED' THEN 'VERIFIED'::"PropertyStatus"
    WHEN 'DISPUTED' THEN 'DISPUTED'::"PropertyStatus"
    WHEN 'ARCHIVED' THEN 'ARCHIVED'::"PropertyStatus"
    ELSE 'SUBMITTED'::"PropertyStatus"
  END);

ALTER TABLE "properties" ALTER COLUMN "external_property_id" SET NOT NULL;
ALTER TABLE "properties" DROP COLUMN "gpsCoordinates";

DROP INDEX IF EXISTS "properties_reference_key";
DROP INDEX IF EXISTS "properties_concessionId_assemblyId_status_idx";
DROP INDEX IF EXISTS "properties_concessionId_reference_idx";

CREATE UNIQUE INDEX "properties_croip_property_id_key" ON "properties"("croip_property_id");
CREATE UNIQUE INDEX "properties_concession_id_external_property_id_key" ON "properties"("concession_id", "external_property_id");
CREATE INDEX "properties_concession_id_assembly_id_status_idx" ON "properties"("concession_id", "assembly_id", "status");
CREATE INDEX "properties_concession_id_assembly_id_property_type_idx" ON "properties"("concession_id", "assembly_id", "property_type");
CREATE INDEX "properties_digital_address_idx" ON "properties"("digital_address");
CREATE INDEX "properties_ratepayer_ref_idx" ON "properties"("ratepayer_ref");
CREATE INDEX "properties_zone_code_block_code_idx" ON "properties"("zone_code", "block_code");

-- Field verification audit trail
ALTER TABLE "field_verifications" RENAME COLUMN "propertyId" TO "property_id";
ALTER TABLE "field_verifications" RENAME COLUMN "agentId" TO "agent_id";
ALTER TABLE "field_verifications" RENAME COLUMN "verifiedAt" TO "verified_at";
ALTER TABLE "field_verifications" ADD COLUMN "photo_document_id" UUID;
ALTER TABLE "field_verifications" DROP COLUMN "photoUrl";
ALTER TABLE "field_verifications"
  ALTER COLUMN "status" TYPE "VerificationState"
  USING (CASE UPPER("status")
    WHEN 'REJECTED' THEN 'REJECTED'::"VerificationState"
    WHEN 'NEEDS_CORRECTION' THEN 'NEEDS_CORRECTION'::"VerificationState"
    ELSE 'APPROVED'::"VerificationState"
  END);

ALTER TABLE "field_verifications"
  ADD CONSTRAINT "field_verifications_property_id_fkey"
  FOREIGN KEY ("property_id") REFERENCES "properties"("id") ON DELETE CASCADE ON UPDATE CASCADE;

DROP INDEX IF EXISTS "field_verifications_propertyId_idx";
CREATE INDEX "field_verifications_property_id_idx" ON "field_verifications"("property_id");
