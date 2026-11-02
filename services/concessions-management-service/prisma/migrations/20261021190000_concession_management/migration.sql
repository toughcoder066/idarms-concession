-- AlterTable
ALTER TABLE "assemblies"
  ADD COLUMN "croip_assembly_id" TEXT,
  ADD COLUMN "status" TEXT NOT NULL DEFAULT 'CONFIGURING',
  ADD COLUMN "logo_url" TEXT,
  ADD COLUMN "signature_url" TEXT,
  ADD COLUMN "bill_notice" TEXT,
  ADD COLUMN "branding_approved_by_name" TEXT,
  ADD COLUMN "branding_approved_at" TIMESTAMP(3),
  ADD COLUMN "admin_email" TEXT,
  ADD COLUMN "admin_invited_at" TIMESTAMP(3);

-- AlterTable
ALTER TABLE "fee_fixing_bylaws"
  ADD COLUMN "minimum_levy" DECIMAL(12,2) NOT NULL DEFAULT 0,
  ADD COLUMN "status" TEXT NOT NULL DEFAULT 'DRAFT',
  ADD COLUMN "version" INTEGER NOT NULL DEFAULT 1,
  ADD COLUMN "published_at" TIMESTAMP(3),
  ADD COLUMN "published_by" TEXT;

-- CreateTable
CREATE TABLE "assembly_targets" (
    "id" UUID NOT NULL,
    "assembly_id" UUID NOT NULL,
    "fiscal_year" INTEGER NOT NULL,
    "target_amount" DECIMAL(14,2) NOT NULL,
    "set_by" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "assembly_targets_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "approval_requests" (
    "id" UUID NOT NULL,
    "assembly_id" UUID NOT NULL,
    "request_type" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'PENDING',
    "requested_by" TEXT NOT NULL,
    "requested_by_name" TEXT,
    "required_role" TEXT NOT NULL,
    "summary" TEXT NOT NULL,
    "amount" DECIMAL(12,2),
    "payload" JSONB NOT NULL,
    "sla_due_at" TIMESTAMP(3) NOT NULL,
    "resolution_note" TEXT,
    "resolved_by" TEXT,
    "resolved_by_name" TEXT,
    "resolved_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "approval_requests_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "agent_assignments" (
    "id" UUID NOT NULL,
    "assembly_id" UUID NOT NULL,
    "agent_email" TEXT NOT NULL,
    "agent_name" TEXT NOT NULL,
    "agent_subject" TEXT,
    "zone_id" UUID,
    "assigned_by" TEXT NOT NULL,
    "assigned_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "agent_assignments_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "assemblies_croip_assembly_id_key" ON "assemblies"("croip_assembly_id");

-- CreateIndex
CREATE UNIQUE INDEX "assembly_targets_assembly_id_fiscal_year_key" ON "assembly_targets"("assembly_id", "fiscal_year");

-- CreateIndex
CREATE INDEX "approval_requests_assembly_id_status_sla_due_at_idx" ON "approval_requests"("assembly_id", "status", "sla_due_at");

-- CreateIndex
CREATE UNIQUE INDEX "agent_assignments_assembly_id_agent_email_key" ON "agent_assignments"("assembly_id", "agent_email");

-- CreateIndex
CREATE INDEX "agent_assignments_assembly_id_zone_id_idx" ON "agent_assignments"("assembly_id", "zone_id");

-- AddForeignKey
ALTER TABLE "assembly_targets" ADD CONSTRAINT "assembly_targets_assembly_id_fkey" FOREIGN KEY ("assembly_id") REFERENCES "assemblies"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "approval_requests" ADD CONSTRAINT "approval_requests_assembly_id_fkey" FOREIGN KEY ("assembly_id") REFERENCES "assemblies"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "agent_assignments" ADD CONSTRAINT "agent_assignments_assembly_id_fkey" FOREIGN KEY ("assembly_id") REFERENCES "assemblies"("id") ON DELETE CASCADE ON UPDATE CASCADE;
