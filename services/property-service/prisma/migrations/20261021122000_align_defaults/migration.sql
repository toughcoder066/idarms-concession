-- Align database defaults with the Prisma schema.
ALTER TABLE "properties" ALTER COLUMN "ratepayer_ref" DROP NOT NULL,
ALTER COLUMN "property_type" SET DEFAULT 'UNCLASSIFIED',
ALTER COLUMN "status" SET DEFAULT 'SUBMITTED',
ALTER COLUMN "registered_by" SET DEFAULT '00000000-0000-0000-0000-000000000000',
ALTER COLUMN "updated_at" DROP DEFAULT;
