-- Provider-agnostic payment transaction schema.

CREATE TYPE "PaymentChannel" AS ENUM ('MOBILE_MONEY', 'BANK_CARD', 'POS_TERMINAL', 'CASH_DESK');
CREATE TYPE "PaymentStatus" AS ENUM ('PENDING', 'SUCCESS', 'FAILED', 'REVERSED');

ALTER TABLE "bill_replicas" RENAME COLUMN "assemblyId" TO "assembly_id";
ALTER TABLE "bill_replicas" RENAME COLUMN "amountDue" TO "total_amount";
ALTER TABLE "bill_replicas"
  ADD COLUMN "concession_id" UUID NOT NULL DEFAULT '00000000-0000-0000-0000-000000000000',
  ADD COLUMN "property_id" UUID NOT NULL DEFAULT '00000000-0000-0000-0000-000000000000',
  ADD COLUMN "fiscal_year" INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN "amount_paid" DECIMAL(12,2) NOT NULL DEFAULT 0.00,
  ADD COLUMN "currency" TEXT NOT NULL DEFAULT 'GHS',
  ADD COLUMN "due_date" TIMESTAMP(3),
  ADD COLUMN "synced_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;
ALTER TABLE "bill_replicas" ALTER COLUMN "concession_id" DROP DEFAULT;
ALTER TABLE "bill_replicas" ALTER COLUMN "property_id" DROP DEFAULT;
CREATE INDEX "bill_replicas_concession_id_assembly_id_status_idx" ON "bill_replicas"("concession_id", "assembly_id", "status");

ALTER TABLE "payments" RENAME TO "payment_transactions";
ALTER TABLE "payment_transactions" RENAME COLUMN "concessionId" TO "concession_id";
ALTER TABLE "payment_transactions" RENAME COLUMN "assemblyId" TO "assembly_id";
ALTER TABLE "payment_transactions" RENAME COLUMN "billId" TO "bill_id";
ALTER TABLE "payment_transactions" RENAME COLUMN "gatewayRef" TO "reference";
ALTER TABLE "payment_transactions" RENAME COLUMN "createdAt" TO "created_at";

ALTER TABLE "payment_transactions"
  ADD COLUMN "external_reference" TEXT,
  ADD COLUMN "property_id" UUID NOT NULL DEFAULT '00000000-0000-0000-0000-000000000000',
  ADD COLUMN "currency" TEXT NOT NULL DEFAULT 'GHS',
  ADD COLUMN "provider" TEXT NOT NULL DEFAULT 'PAYSTACK',
  ADD COLUMN "payer_phone" TEXT,
  ADD COLUMN "payer_email" TEXT,
  ADD COLUMN "failure_reason" TEXT,
  ADD COLUMN "raw_gateway_response" JSONB,
  ADD COLUMN "paid_at" TIMESTAMP(3),
  ADD COLUMN "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;

UPDATE "payment_transactions" SET "external_reference" = "reference";
ALTER TABLE "payment_transactions" ALTER COLUMN "property_id" DROP DEFAULT;

ALTER TABLE "payment_transactions"
  ALTER COLUMN "channel" TYPE "PaymentChannel"
  USING (CASE UPPER("channel")
    WHEN 'MOMO' THEN 'MOBILE_MONEY'::"PaymentChannel"
    WHEN 'MOBILE_MONEY' THEN 'MOBILE_MONEY'::"PaymentChannel"
    WHEN 'CARD' THEN 'BANK_CARD'::"PaymentChannel"
    WHEN 'BANK_CARD' THEN 'BANK_CARD'::"PaymentChannel"
    WHEN 'POS_TERMINAL' THEN 'POS_TERMINAL'::"PaymentChannel"
    WHEN 'CASH_DESK' THEN 'CASH_DESK'::"PaymentChannel"
    ELSE 'CASH_DESK'::"PaymentChannel"
  END);

ALTER TABLE "payment_transactions"
  ALTER COLUMN "status" TYPE "PaymentStatus"
  USING (CASE UPPER("status")
    WHEN 'PENDING' THEN 'PENDING'::"PaymentStatus"
    WHEN 'SUCCESSFUL' THEN 'SUCCESS'::"PaymentStatus"
    WHEN 'SUCCESS' THEN 'SUCCESS'::"PaymentStatus"
    WHEN 'FAILED' THEN 'FAILED'::"PaymentStatus"
    WHEN 'REVERSED' THEN 'REVERSED'::"PaymentStatus"
    ELSE 'PENDING'::"PaymentStatus"
  END);

DROP INDEX IF EXISTS "payments_gatewayRef_key";
DROP INDEX IF EXISTS "payments_concessionId_assemblyId_status_idx";
CREATE UNIQUE INDEX "payment_transactions_reference_key" ON "payment_transactions"("reference");
CREATE UNIQUE INDEX "payment_transactions_external_reference_key" ON "payment_transactions"("external_reference");
CREATE INDEX "payment_transactions_concession_id_assembly_id_status_idx" ON "payment_transactions"("concession_id", "assembly_id", "status");
CREATE INDEX "payment_transactions_bill_id_idx" ON "payment_transactions"("bill_id");
