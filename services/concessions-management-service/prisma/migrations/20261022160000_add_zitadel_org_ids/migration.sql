-- Map ZITADEL organizations to the iDARMS portfolio/assembly context.
ALTER TABLE "concession_contracts" ADD COLUMN "zitadel_org_id" TEXT;
ALTER TABLE "assemblies" ADD COLUMN "zitadel_org_id" TEXT;

CREATE UNIQUE INDEX "concession_contracts_zitadel_org_id_key" ON "concession_contracts"("zitadel_org_id");
CREATE UNIQUE INDEX "assemblies_zitadel_org_id_key" ON "assemblies"("zitadel_org_id");
