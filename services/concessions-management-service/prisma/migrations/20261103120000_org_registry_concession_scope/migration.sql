-- iDARMS has two organisational scopes (ADR-0003): CONCESSION (the one
-- concession-wide org) and ASSEMBLY (one org per assembly). PORTFOLIO meant
-- the same as CONCESSION and is renamed.
UPDATE "zitadel_org_contexts" SET "scope" = 'CONCESSION' WHERE "scope" = 'PORTFOLIO';

-- A CONCESSION org has no assembly; an ASSEMBLY org always has one.
ALTER TABLE "zitadel_org_contexts" ADD CONSTRAINT "zitadel_org_contexts_scope_check" CHECK (
    ("scope" = 'CONCESSION' AND "assembly_id" IS NULL)
    OR ("scope" = 'ASSEMBLY' AND "assembly_id" IS NOT NULL)
);

-- At most one concession org per concession. Hand-written: Prisma cannot
-- express a partial unique index.
CREATE UNIQUE INDEX "zitadel_org_contexts_one_concession_org_key"
    ON "zitadel_org_contexts" ("concession_id")
    WHERE "scope" = 'CONCESSION';
