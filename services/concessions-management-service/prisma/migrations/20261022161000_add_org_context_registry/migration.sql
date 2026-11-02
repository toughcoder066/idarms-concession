-- Registry mapping a ZITADEL organization to the iDARMS tenant context.
CREATE TABLE "zitadel_org_contexts" (
    "org_id" TEXT NOT NULL,
    "concession_id" UUID NOT NULL,
    "assembly_id" UUID,
    "scope" TEXT NOT NULL DEFAULT 'ASSEMBLY',
    "primary_domain" TEXT,
    "status" TEXT NOT NULL DEFAULT 'ACTIVE',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "zitadel_org_contexts_pkey" PRIMARY KEY ("org_id")
);

CREATE INDEX "zitadel_org_contexts_concession_id_idx" ON "zitadel_org_contexts"("concession_id");
CREATE INDEX "zitadel_org_contexts_assembly_id_idx" ON "zitadel_org_contexts"("assembly_id");
