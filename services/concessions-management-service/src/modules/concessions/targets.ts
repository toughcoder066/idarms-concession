import type { PrismaClient } from '../../../generated/prisma';
import { writeAudit } from './audit';
import type { TargetInput } from './schemas';

function present(target: any) {
  return target ? { ...target, targetAmount: Number(target.targetAmount) } : null;
}

async function findAssembly(prisma: PrismaClient, id: string, concessionId: string, assemblyId?: string) {
  if (assemblyId && assemblyId !== id) return null;
  return prisma.assembly.findFirst({ where: { id, concessions: { some: { concessionId } } } });
}

export async function getTarget(
  prisma: PrismaClient,
  assemblyId: string,
  scope: { concessionId: string; assemblyId?: string },
  fiscalYear: number,
) {
  const assembly = await findAssembly(prisma, assemblyId, scope.concessionId, scope.assemblyId);
  if (!assembly) return null;
  const target = await prisma.assemblyTarget.findUnique({
    where: { assemblyId_fiscalYear: { assemblyId, fiscalYear } },
  });
  return { assemblyId, fiscalYear, target: present(target) };
}

export async function saveTarget(
  prisma: PrismaClient,
  assemblyId: string,
  scope: { concessionId: string; assemblyId?: string },
  input: TargetInput,
  context: { actorId: string; requestId: string },
) {
  const assembly = await findAssembly(prisma, assemblyId, scope.concessionId, scope.assemblyId);
  if (!assembly) return null;

  return prisma.$transaction(async (tx) => {
    const target = await tx.assemblyTarget.upsert({
      where: { assemblyId_fiscalYear: { assemblyId, fiscalYear: input.fiscalYear } },
      create: {
        assemblyId,
        fiscalYear: input.fiscalYear,
        targetAmount: input.targetAmount,
        setBy: context.actorId,
      },
      update: { targetAmount: input.targetAmount, setBy: context.actorId },
    });
    await writeAudit(tx, {
      actorId: context.actorId,
      concessionId: scope.concessionId,
      assemblyId,
      action: 'target.set',
      resourceType: 'AssemblyTarget',
      resourceId: target.id,
      requestId: context.requestId,
      outcome: 'SUCCESS',
      humanReadable: `Set FY${input.fiscalYear} revenue target for ${assembly.assemblyName} to GHS ${input.targetAmount.toLocaleString('en-GH')}.`,
      metadata: { fiscalYear: input.fiscalYear, targetAmount: input.targetAmount },
    });
    return present(target);
  });
}
