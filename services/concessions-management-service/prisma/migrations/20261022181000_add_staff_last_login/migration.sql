-- Persist the last observed ZITADEL session activity so staff history survives
-- session revocation/deactivation.
ALTER TABLE "staff_members" ADD COLUMN "last_login_at" TIMESTAMP(3);
