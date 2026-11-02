-- Reporting metric precision and tenancy index.

ALTER TABLE "dashboard_metrics" RENAME COLUMN "concessionId" TO "concession_id";
ALTER TABLE "dashboard_metrics" RENAME COLUMN "assemblyId" TO "assembly_id";
ALTER TABLE "dashboard_metrics" RENAME COLUMN "totalBilled" TO "total_billed";
ALTER TABLE "dashboard_metrics" RENAME COLUMN "totalCollected" TO "total_collected";
ALTER TABLE "dashboard_metrics" RENAME COLUMN "propertiesVerified" TO "properties_verified";
ALTER TABLE "dashboard_metrics" ADD COLUMN "currency" TEXT NOT NULL DEFAULT 'GHS';
ALTER TABLE "dashboard_metrics" ALTER COLUMN "total_billed" TYPE DECIMAL(14,2);
ALTER TABLE "dashboard_metrics" ALTER COLUMN "total_collected" TYPE DECIMAL(14,2);

DROP INDEX IF EXISTS "dashboard_metrics_concessionId_assemblyId_date_key";
CREATE UNIQUE INDEX "dashboard_metrics_concession_id_assembly_id_date_key" ON "dashboard_metrics"("concession_id", "assembly_id", "date");
CREATE INDEX "dashboard_metrics_concession_id_assembly_id_idx" ON "dashboard_metrics"("concession_id", "assembly_id");
