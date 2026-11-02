-- Add a sync-status index used by the outbox relay and dashboards.
CREATE INDEX "sync_records_entityType_direction_status_idx" ON "sync_records"("entityType", "direction", "status");
