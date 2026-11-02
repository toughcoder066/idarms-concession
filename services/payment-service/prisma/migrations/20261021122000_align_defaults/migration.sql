-- Align defaults and the primary-key constraint name with the Prisma schema.
ALTER TABLE "bill_replicas" ALTER COLUMN "fiscal_year" DROP DEFAULT;
ALTER TABLE "payment_transactions" RENAME CONSTRAINT "payments_pkey" TO "payment_transactions_pkey";
ALTER TABLE "payment_transactions" ALTER COLUMN "status" SET DEFAULT 'PENDING';
ALTER TABLE "payment_transactions" ALTER COLUMN "updated_at" DROP DEFAULT;
