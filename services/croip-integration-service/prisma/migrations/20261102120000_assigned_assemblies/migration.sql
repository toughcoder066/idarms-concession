-- CreateTable
CREATE TABLE "assigned_assemblies" (
    "assemblyId" UUID NOT NULL,
    "concessionId" UUID NOT NULL,
    "regionId" UUID,
    "code" VARCHAR(50) NOT NULL,
    "name" VARCHAR(150) NOT NULL,
    "category" VARCHAR(20),
    "contractStart" DATE,
    "contractEnd" DATE NOT NULL,
    "status" VARCHAR(20) NOT NULL DEFAULT 'ACTIVE',
    "polygonGeoJson" JSONB,
    "source" VARCHAR(20) NOT NULL,
    "importVersion" INTEGER NOT NULL,
    "importedAt" TIMESTAMP(3) NOT NULL,
    "removedAt" TIMESTAMP(3),

    CONSTRAINT "assigned_assemblies_pkey" PRIMARY KEY ("assemblyId")
);

-- CreateIndex
CREATE INDEX "assigned_assemblies_concessionId_status_idx" ON "assigned_assemblies"("concessionId", "status");

