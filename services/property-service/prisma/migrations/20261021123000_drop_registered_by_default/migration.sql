-- registered_by is supplied by the caller (or the CROIP sync actor), not the database.
ALTER TABLE "properties" ALTER COLUMN "registered_by" DROP DEFAULT;
