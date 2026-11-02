-- Local invitation metadata, two-phase import batches, and Super Admin transparency rows.
CREATE TABLE "staff_members" (
    "id" UUID NOT NULL,
    "assembly_id" UUID NOT NULL,
    "org_id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "phone" TEXT,
    "role" TEXT NOT NULL,
    "invited_by" TEXT,
    "invited_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "last_known_status" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "staff_members_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "staff_members_assembly_id_user_id_key" ON "staff_members"("assembly_id", "user_id");
CREATE INDEX "staff_members_assembly_id_idx" ON "staff_members"("assembly_id");
CREATE INDEX "staff_members_email_idx" ON "staff_members"("email");

CREATE TABLE "staff_import_batches" (
    "id" UUID NOT NULL,
    "assembly_id" UUID NOT NULL,
    "concession_id" UUID NOT NULL,
    "org_id" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'VALIDATED',
    "rows" JSONB NOT NULL,
    "results" JSONB,
    "created_by" TEXT NOT NULL,
    "created_by_role" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "committed_at" TIMESTAMP(3),
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "staff_import_batches_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "staff_import_batches_assembly_id_created_at_idx" ON "staff_import_batches"("assembly_id", "created_at");

CREATE TABLE "staff_notifications" (
    "id" UUID NOT NULL,
    "assembly_id" UUID NOT NULL,
    "concession_id" UUID NOT NULL,
    "actor_id" TEXT NOT NULL,
    "actor_role" TEXT NOT NULL,
    "action" TEXT NOT NULL,
    "target_user_id" TEXT,
    "target_role" TEXT,
    "message" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "read_at" TIMESTAMP(3),

    CONSTRAINT "staff_notifications_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "staff_notifications_assembly_id_created_at_idx" ON "staff_notifications"("assembly_id", "created_at");
