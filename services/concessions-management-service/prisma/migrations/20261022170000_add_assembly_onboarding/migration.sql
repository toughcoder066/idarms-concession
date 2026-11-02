-- Durable saga state for assembly onboarding.
CREATE TABLE "assembly_onboardings" (
    "assembly_id" UUID NOT NULL,
    "concession_id" UUID NOT NULL,
    "assembly_name" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'PENDING',
    "org_id" TEXT,
    "primary_domain" TEXT,
    "first_admin_email" TEXT,
    "error" TEXT,
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "assembly_onboardings_pkey" PRIMARY KEY ("assembly_id")
);

CREATE INDEX "assembly_onboardings_status_idx" ON "assembly_onboardings"("status");

-- One ZITADEL organization per assembly. PostgreSQL permits multiple NULLs,
-- so portfolio-scoped rows can remain without an assembly link.
DROP INDEX "zitadel_org_contexts_assembly_id_idx";
CREATE UNIQUE INDEX "zitadel_org_contexts_assembly_id_key" ON "zitadel_org_contexts"("assembly_id");
