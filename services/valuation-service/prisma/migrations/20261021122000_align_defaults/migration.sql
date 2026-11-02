-- Align defaults and index names with the Prisma schema.
ALTER TABLE "valuations" ALTER COLUMN "property_type" DROP DEFAULT,
ALTER COLUMN "updated_at" DROP DEFAULT;
ALTER INDEX IF EXISTS "valuations_propertyId_key" RENAME TO "valuations_property_id_key";
