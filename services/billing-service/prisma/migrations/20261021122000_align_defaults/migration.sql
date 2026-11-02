-- Align defaults and index names with the Prisma schema.
ALTER TABLE "bills" ALTER COLUMN "status" SET DEFAULT 'UNPAID',
ALTER COLUMN "updated_at" DROP DEFAULT;
ALTER TABLE "valuation_replicas" ALTER COLUMN "property_type" DROP DEFAULT,
ALTER COLUMN "fiscal_year" DROP DEFAULT;
ALTER INDEX IF EXISTS "fee_fixing_replicas_assembly_id_fiscal_year_property_type_co_ke"
  RENAME TO "fee_fixing_replicas_assembly_id_fiscal_year_property_type_c_key";
