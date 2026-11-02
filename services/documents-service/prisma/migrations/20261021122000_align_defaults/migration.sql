-- Drop the legacy index and align defaults with the Prisma schema.
DROP INDEX IF EXISTS "documents_concessionId_entityType_entityId_idx";
ALTER TABLE "documents" ALTER COLUMN "updated_at" DROP DEFAULT;
