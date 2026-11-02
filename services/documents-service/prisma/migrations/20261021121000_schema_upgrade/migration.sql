-- Presigned-upload document metadata upgrade.

CREATE TYPE "EntityType" AS ENUM ('PROPERTY', 'RATEPAYER', 'BILL', 'PAYMENT');
CREATE TYPE "UploadStatus" AS ENUM ('PENDING_UPLOAD', 'UPLOADED', 'FAILED', 'DELETED');

ALTER TABLE "documents" RENAME COLUMN "concessionId" TO "concession_id";
ALTER TABLE "documents" RENAME COLUMN "assemblyId" TO "assembly_id";
ALTER TABLE "documents" RENAME COLUMN "entityType" TO "entity_type";
ALTER TABLE "documents" RENAME COLUMN "entityId" TO "entity_id";
ALTER TABLE "documents" RENAME COLUMN "documentType" TO "document_type";
ALTER TABLE "documents" RENAME COLUMN "fileUrl" TO "file_url";
ALTER TABLE "documents" RENAME COLUMN "uploadedBy" TO "uploaded_by";
ALTER TABLE "documents" RENAME COLUMN "createdAt" TO "created_at";

ALTER TABLE "documents"
  ADD COLUMN "storage_provider" TEXT NOT NULL DEFAULT 'S3',
  ADD COLUMN "storage_key" TEXT,
  ADD COLUMN "file_name" TEXT,
  ADD COLUMN "mime_type" TEXT,
  ADD COLUMN "file_size" INTEGER,
  ADD COLUMN "checksum" TEXT,
  ADD COLUMN "upload_status" "UploadStatus" NOT NULL DEFAULT 'PENDING_UPLOAD',
  ADD COLUMN "uploaded_at" TIMESTAMP(3),
  ADD COLUMN "metadata" JSONB,
  ADD COLUMN "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;

UPDATE "documents"
SET "upload_status" = 'UPLOADED',
    "uploaded_at" = "created_at"
WHERE "file_url" IS NOT NULL AND "file_url" <> '';

ALTER TABLE "documents" ALTER COLUMN "file_url" DROP NOT NULL;
ALTER TABLE "documents" ALTER COLUMN "uploaded_by" DROP NOT NULL;

ALTER TABLE "documents"
  ALTER COLUMN "entity_type" TYPE "EntityType"
  USING (CASE UPPER("entity_type")
    WHEN 'PROPERTY' THEN 'PROPERTY'::"EntityType"
    WHEN 'RATEPAYER' THEN 'RATEPAYER'::"EntityType"
    WHEN 'BILL' THEN 'BILL'::"EntityType"
    WHEN 'PAYMENT' THEN 'PAYMENT'::"EntityType"
    ELSE 'PROPERTY'::"EntityType"
  END);

CREATE INDEX "documents_concession_id_assembly_id_idx" ON "documents"("concession_id", "assembly_id");
CREATE INDEX "documents_entity_type_entity_id_idx" ON "documents"("entity_type", "entity_id");
CREATE INDEX "documents_upload_status_idx" ON "documents"("upload_status");
