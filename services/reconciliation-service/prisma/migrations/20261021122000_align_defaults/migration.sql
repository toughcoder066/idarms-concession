-- Align defaults with the Prisma schema.
ALTER TABLE "bill_replicas" ALTER COLUMN "fiscal_year" DROP DEFAULT,
ALTER COLUMN "status" DROP DEFAULT;
