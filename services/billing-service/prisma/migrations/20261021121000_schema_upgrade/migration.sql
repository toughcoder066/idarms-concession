-- Fee-fixing-aware billing schema.

CREATE TYPE "BillStatus" AS ENUM ('UNPAID', 'PARTIALLY_PAID', 'PAID', 'OVERDUE', 'CANCELLED');

ALTER TABLE "valuation_replicas" RENAME COLUMN "propertyId" TO "property_id";
ALTER TABLE "valuation_replicas" RENAME COLUMN "assemblyId" TO "assembly_id";
ALTER TABLE "valuation_replicas" RENAME COLUMN "taxableValue" TO "taxable_value";
ALTER TABLE "valuation_replicas"
  ADD COLUMN "concession_id" UUID NOT NULL DEFAULT '00000000-0000-0000-0000-000000000000',
  ADD COLUMN "property_type" TEXT NOT NULL DEFAULT 'UNCLASSIFIED',
  ADD COLUMN "property_usage" TEXT NOT NULL DEFAULT 'GENERAL',
  ADD COLUMN "fiscal_year" INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN "synced_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;
ALTER TABLE "valuation_replicas" ALTER COLUMN "concession_id" DROP DEFAULT;
ALTER TABLE "valuation_replicas" ALTER COLUMN "taxable_value" TYPE DECIMAL(14,2);
DROP INDEX IF EXISTS "valuation_replicas_propertyId_key";
CREATE UNIQUE INDEX "valuation_replicas_property_id_key" ON "valuation_replicas"("property_id");
CREATE INDEX "valuation_replicas_concession_id_assembly_id_fiscal_year_idx" ON "valuation_replicas"("concession_id", "assembly_id", "fiscal_year");

ALTER TABLE "bills" RENAME COLUMN "concessionId" TO "concession_id";
ALTER TABLE "bills" RENAME COLUMN "assemblyId" TO "assembly_id";
ALTER TABLE "bills" RENAME COLUMN "billNumber" TO "bill_number";
ALTER TABLE "bills" RENAME COLUMN "propertyId" TO "property_id";
ALTER TABLE "bills" RENAME COLUMN "amountDue" TO "amount_due_legacy";
ALTER TABLE "bills" RENAME COLUMN "amountPaid" TO "amount_paid";
ALTER TABLE "bills" RENAME COLUMN "fiscalYear" TO "fiscal_year";
ALTER TABLE "bills" RENAME COLUMN "createdAt" TO "created_at";

ALTER TABLE "bills"
  ADD COLUMN "ratable_value" DECIMAL(14,2),
  ADD COLUMN "base_rate" DECIMAL(12,2),
  ADD COLUMN "rate_impost" DECIMAL(5,4),
  ADD COLUMN "sub_total" DECIMAL(12,2),
  ADD COLUMN "penalty_amount" DECIMAL(12,2) NOT NULL DEFAULT 0.00,
  ADD COLUMN "discount_amount" DECIMAL(12,2) NOT NULL DEFAULT 0.00,
  ADD COLUMN "total_amount" DECIMAL(12,2),
  ADD COLUMN "currency" TEXT NOT NULL DEFAULT 'GHS',
  ADD COLUMN "issued_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  ADD COLUMN "due_date" TIMESTAMP(3),
  ADD COLUMN "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;

UPDATE "bills"
SET "ratable_value" = "amount_due_legacy",
    "base_rate" = "amount_due_legacy",
    "rate_impost" = 0,
    "sub_total" = "amount_due_legacy",
    "total_amount" = "amount_due_legacy",
    "issued_at" = "created_at",
    "due_date" = "created_at" + INTERVAL '30 days';

ALTER TABLE "bills" ALTER COLUMN "ratable_value" SET NOT NULL;
ALTER TABLE "bills" ALTER COLUMN "base_rate" SET NOT NULL;
ALTER TABLE "bills" ALTER COLUMN "rate_impost" SET NOT NULL;
ALTER TABLE "bills" ALTER COLUMN "sub_total" SET NOT NULL;
ALTER TABLE "bills" ALTER COLUMN "total_amount" SET NOT NULL;
ALTER TABLE "bills" ALTER COLUMN "due_date" SET NOT NULL;
ALTER TABLE "bills" DROP COLUMN "amount_due_legacy";

ALTER TABLE "bills"
  ALTER COLUMN "status" TYPE "BillStatus"
  USING (CASE UPPER("status")
    WHEN 'PAID' THEN 'PAID'::"BillStatus"
    WHEN 'PARTIALLY_PAID' THEN 'PARTIALLY_PAID'::"BillStatus"
    WHEN 'OVERDUE' THEN 'OVERDUE'::"BillStatus"
    WHEN 'CANCELLED' THEN 'CANCELLED'::"BillStatus"
    ELSE 'UNPAID'::"BillStatus"
  END);

DROP INDEX IF EXISTS "bills_billNumber_key";
DROP INDEX IF EXISTS "bills_concessionId_assemblyId_status_idx";
CREATE UNIQUE INDEX "bills_bill_number_key" ON "bills"("bill_number");
CREATE UNIQUE INDEX "bills_property_id_fiscal_year_key" ON "bills"("property_id", "fiscal_year");
CREATE INDEX "bills_concession_id_assembly_id_status_idx" ON "bills"("concession_id", "assembly_id", "status");
CREATE INDEX "bills_status_due_date_idx" ON "bills"("status", "due_date");

CREATE TABLE "fee_fixing_replicas" (
    "id" UUID NOT NULL,
    "assembly_id" UUID NOT NULL,
    "fiscal_year" INTEGER NOT NULL,
    "property_type_code" TEXT NOT NULL,
    "property_usage_code" TEXT NOT NULL,
    "base_rate" DECIMAL(12,2) NOT NULL,
    "rate_impost" DECIMAL(5,4) NOT NULL,
    "currency" TEXT NOT NULL DEFAULT 'GHS',
    "source_version" INTEGER NOT NULL DEFAULT 1,
    "synced_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "fee_fixing_replicas_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "fee_fixing_replicas_assembly_id_fiscal_year_property_type_co_key"
  ON "fee_fixing_replicas"("assembly_id", "fiscal_year", "property_type_code", "property_usage_code");
CREATE INDEX "fee_fixing_replicas_assembly_id_fiscal_year_idx"
  ON "fee_fixing_replicas"("assembly_id", "fiscal_year");
