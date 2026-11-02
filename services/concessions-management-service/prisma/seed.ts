import 'dotenv/config';
import { PrismaClient } from '../generated/prisma';

const prisma = new PrismaClient();
const concessionId = process.env.CONCESSION_ID ?? '11111111-1111-1111-1111-111111111111';
const fiscalYear = Number(process.env.SEED_FISCAL_YEAR ?? new Date().getUTCFullYear());

const lookups = [
  { code: 'RESIDENTIAL', name: 'Residential', sortOrder: 1, usages: [
    { code: 'SINGLE_FAMILY', name: 'Single family home' },
    { code: 'APARTMENT', name: 'Apartment' },
    { code: 'COMPOUND', name: 'Compound house' },
  ] },
  { code: 'COMMERCIAL', name: 'Commercial', sortOrder: 2, usages: [
    { code: 'RETAIL_SHOP', name: 'Retail shop' },
    { code: 'OFFICE', name: 'Office' },
    { code: 'BANK_BRANCH', name: 'Bank branch' },
    { code: 'FUEL_STATION', name: 'Fuel station' },
    { code: 'HOTEL', name: 'Hotel' },
  ] },
  { code: 'INDUSTRIAL', name: 'Industrial', sortOrder: 3, usages: [
    { code: 'WAREHOUSE', name: 'Warehouse' },
    { code: 'FACTORY', name: 'Factory' },
  ] },
  { code: 'INSTITUTIONAL', name: 'Institutional', sortOrder: 4, usages: [
    { code: 'SCHOOL', name: 'School' },
    { code: 'HOSPITAL', name: 'Hospital' },
    { code: 'GOVERNMENT', name: 'Government facility' },
  ] },
  { code: 'AGRICULTURAL', name: 'Agricultural', sortOrder: 5, usages: [
    { code: 'FARM', name: 'Farm' },
  ] },
];

const seededRates: Array<[string, string, number, number, number]> = [
  ['RESIDENTIAL', 'SINGLE_FAMILY', 25, 0.0015, 40],
  ['RESIDENTIAL', 'APARTMENT', 35, 0.0018, 55],
  ['COMMERCIAL', 'RETAIL_SHOP', 60, 0.0042, 180],
  ['COMMERCIAL', 'OFFICE', 110, 0.0065, 320],
  ['COMMERCIAL', 'BANK_BRANCH', 150, 0.0085, 600],
  ['INDUSTRIAL', 'WAREHOUSE', 180, 0.005, 450],
];

async function main() {
  const contract = await prisma.concessionContract.upsert({
    where: { id: concessionId },
    create: {
      id: concessionId,
      concessionCode: 'ZONAL-LOT-2',
      concessionName: 'Zonal Lot 2 Concession',
      stateRevenueShare: 40,
      concessionaireShare: 60,
      startDate: new Date('2024-01-01'),
      endDate: new Date('2031-12-31'),
      isActive: true,
    },
    update: {},
  });
  console.log(`contract: ${contract.concessionCode}`);

  const usages = new Map<string, { id: string; propertyTypeId: string }>();
  for (const type of lookups) {
    const propertyType = await prisma.propertyTypeLookup.upsert({
      where: { code: type.code },
      create: { code: type.code, name: type.name, sortOrder: type.sortOrder },
      update: { name: type.name, sortOrder: type.sortOrder, isActive: true },
    });
    for (const [index, usage] of type.usages.entries()) {
      const row = await prisma.propertyUsageLookup.upsert({
        where: { code: usage.code },
        create: {
          propertyTypeId: propertyType.id,
          code: usage.code,
          name: usage.name,
          sortOrder: index + 1,
        },
        update: {
          propertyTypeId: propertyType.id,
          name: usage.name,
          sortOrder: index + 1,
          isActive: true,
        },
      });
      usages.set(`${type.code}:${usage.code}`, { id: row.id, propertyTypeId: propertyType.id });
    }
  }
  console.log(`lookups: ${usages.size} usages`);

  const ama = await prisma.assembly.upsert({
    where: { assemblyCode: 'AMA' },
    create: {
      assemblyCode: 'AMA',
      assemblyName: 'Accra Metropolitan Assembly',
      region: 'Greater Accra',
      croipAssemblyId: 'croip_asm_998234',
      status: 'CONFIGURING',
      prefixRules: ['GA-', 'AMA-'],
      logoUrl: null,
      signatureUrl: null,
      billNotice: 'Property rates are payable at the Assembly revenue office.',
      brandingApprovedByName: null,
      adminEmail: 'assembly.admin@ama.gov.gh',
      adminInvitedAt: new Date(),
    },
    update: {},
  });

  const ladma = await prisma.assembly.upsert({
    where: { assemblyCode: 'LADMA' },
    create: {
      assemblyCode: 'LADMA',
      assemblyName: 'Ledzokuku Municipal Assembly',
      region: 'Greater Accra',
      status: 'CONFIGURING',
      prefixRules: ['LEK-'],
    },
    update: {},
  });

  for (const assembly of [ama, ladma]) {
    await prisma.concessionAssembly.upsert({
      where: { concessionId_assemblyId: { concessionId, assemblyId: assembly.id } },
      create: { concessionId, assemblyId: assembly.id },
      update: {},
    });
  }

  for (const [typeCode, usageCode, baseRate, rateImpost, minimumLevy] of seededRates) {
    const lookup = usages.get(`${typeCode}:${usageCode}`);
    if (!lookup) continue;
    await prisma.feeFixingBylaw.upsert({
      where: {
        assemblyId_fiscalYear_propertyTypeId_propertyUsageId: {
          assemblyId: ama.id,
          fiscalYear,
          propertyTypeId: lookup.propertyTypeId,
          propertyUsageId: lookup.id,
        },
      },
      create: {
        assemblyId: ama.id,
        fiscalYear,
        propertyTypeId: lookup.propertyTypeId,
        propertyUsageId: lookup.id,
        baseRate,
        rateImpost,
        minimumLevy,
        status: 'DRAFT',
      },
      update: {},
    });
  }

  await prisma.assemblyTarget.upsert({
    where: { assemblyId_fiscalYear: { assemblyId: ama.id, fiscalYear } },
    create: { assemblyId: ama.id, fiscalYear, targetAmount: 5_000_000, setBy: 'seed' },
    update: {},
  });

  await prisma.agentAssignment.upsert({
    where: { assemblyId_agentEmail: { assemblyId: ama.id, agentEmail: 'field-agent@idarms.local' } },
    create: {
      assemblyId: ama.id,
      agentEmail: 'field-agent@idarms.local',
      agentName: 'Field Agent',
      assignedBy: 'seed',
    },
    update: {},
  });

  console.log(`assemblies: ${ama.assemblyCode}, ${ladma.assemblyCode}`);
  console.log(`seeded ${seededRates.length} FY${fiscalYear} rate rows for ${ama.assemblyCode}`);
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
