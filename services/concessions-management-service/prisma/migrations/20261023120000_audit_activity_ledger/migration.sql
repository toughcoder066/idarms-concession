-- Audit queries filter by actor and action within an assembly.
CREATE INDEX "audit_records_assemblyId_actorId_occurredAt_idx"
  ON "audit_records"("assemblyId", "actorId", "occurredAt");

CREATE INDEX "audit_records_assemblyId_action_occurredAt_idx"
  ON "audit_records"("assemblyId", "action", "occurredAt");

-- Older onboarding audit rows predate the structured actorRole field. The
-- local onboarding route has only ever been callable by a Super Admin or
-- Platform Admin; existing rows were written by the Super Admin fixture.
UPDATE "audit_records"
SET "metadata" = jsonb_set("metadata", '{actorRole}', '"CONCESSION_SUPER_ADMIN"'::jsonb, true)
WHERE "action" LIKE 'assembly.onboarding.%'
  AND ("metadata"->>'actorRole') IS NULL;

-- Ensure every historical row has an explicit actor role for filtering and display.
UPDATE "audit_records"
SET "metadata" = jsonb_set("metadata", '{actorRole}', '"UNKNOWN"'::jsonb, true)
WHERE ("metadata"->>'actorRole') IS NULL;
