-- Tenancy-aware reconciliation schema.

CREATE TYPE "DiscrepancyReason" AS ENUM ('AMOUNT_MISMATCH', 'UNMATCHED_PAYMENT');

ALTER TABLE "bill_replicas" RENAME COLUMN "amountDue" TO "total_amount";
ALTER TABLE "bill_replicas"
  ADD COLUMN "concession_id" UUID NOT NULL DEFAULT '00000000-0000-0000-0000-000000000000',
  ADD COLUMN "assembly_id" UUID NOT NULL DEFAULT '00000000-0000-0000-0000-000000000000',
  ADD COLUMN "property_id" UUID NOT NULL DEFAULT '00000000-0000-0000-0000-000000000000',
  ADD COLUMN "fiscal_year" INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN "amount_paid" DECIMAL(12,2) NOT NULL DEFAULT 0.00,
  ADD COLUMN "currency" TEXT NOT NULL DEFAULT 'GHS',
  ADD COLUMN "status" TEXT NOT NULL DEFAULT 'UNPAID',
  ADD COLUMN "synced_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;
ALTER TABLE "bill_replicas" ALTER COLUMN "concession_id" DROP DEFAULT;
ALTER TABLE "bill_replicas" ALTER COLUMN "assembly_id" DROP DEFAULT;
ALTER TABLE "bill_replicas" ALTER COLUMN "property_id" DROP DEFAULT;
CREATE INDEX "bill_replicas_concession_id_assembly_id_status_idx" ON "bill_replicas"("concession_id", "assembly_id", "status");

ALTER TABLE "payment_replicas" RENAME COLUMN "billId" TO "bill_id";
ALTER TABLE "payment_replicas"
  ADD COLUMN "concession_id" UUID NOT NULL DEFAULT '00000000-0000-0000-0000-000000000000',
  ADD COLUMN "assembly_id" UUID NOT NULL DEFAULT '00000000-0000-0000-0000-000000000000',
  ADD COLUMN "currency" TEXT NOT NULL DEFAULT 'GHS',
  ADD COLUMN "synced_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;
ALTER TABLE "payment_replicas" ALTER COLUMN "concession_id" DROP DEFAULT;
ALTER TABLE "payment_replicas" ALTER COLUMN "assembly_id" DROP DEFAULT;
CREATE INDEX "payment_replicas_concession_id_assembly_id_status_idx" ON "payment_replicas"("concession_id", "assembly_id", "status");

ALTER TABLE "discrepancies" RENAME COLUMN "billId" TO "bill_id";
ALTER TABLE "discrepancies" RENAME COLUMN "paymentId" TO "payment_id";
ALTER TABLE "discrepancies" RENAME COLUMN "createdAt" TO "created_at";
ALTER TABLE "discrepancies"
  ADD COLUMN "concession_id" UUID NOT NULL DEFAULT '00000000-0000-0000-0000-000000000000',
  ADD COLUMN "assembly_id" UUID NOT NULL DEFAULT '00000000-0000-0000-0000-000000000000',
  ADD COLUMN "resolved_at" TIMESTAMP(3);
ALTER TABLE "discrepancies" ALTER COLUMN "concession_id" DROP DEFAULT;
ALTER TABLE "discrepancies" ALTER COLUMN "assembly_id" DROP DEFAULT;

ALTER TABLE "discrepancies"
  ALTER COLUMN "reason" TYPE "DiscrepancyReason"
  USING (CASE UPPER("reason")
    WHEN 'AMOUNT_MISMATCH' THEN 'AMOUNT_MISMATCH'::"DiscrepancyReason"
    WHEN 'UNMATCHED_PAYMENT' THEN 'UNMATCHED_PAYMENT'::"DiscrepancyReason"
    ELSE 'AMOUNT_MISMATCH'::"DiscrepancyReason"
  END);

CREATE UNIQUE INDEX "discrepancies_bill_id_payment_id_reason_key" ON "discrepancies"("bill_id", "payment_id", "reason");
CREATE INDEX "discrepancies_concession_id_assembly_id_resolved_idx" ON "discrepancies"("concession_id", "assembly_id", "resolved");
