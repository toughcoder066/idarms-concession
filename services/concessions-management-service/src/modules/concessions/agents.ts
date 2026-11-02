import type { PrismaClient } from '../../../generated/prisma';
import { writeAudit } from './audit';
import type { AgentAssignmentInput } from './schemas';

export async function listAgents(
  prisma: PrismaClient,
  assemblyId: string,
  scope: { concessionId: string; assemblyId?: string },
) {
  if (scope.assemblyId && scope.assemblyId !== assemblyId) return null;
  const assembly = await prisma.assembly.findFirst({
    where: { id: assemblyId, concessions: { some: { concessionId: scope.concessionId } } },
  });
  if (!assembly) return null;
  return prisma.agentAssignment.findMany({
    where: { assemblyId },
    orderBy: { assignedAt: 'desc' },
  });
}

export async function assignAgent(
  prisma: PrismaClient,
  assemblyId: string,
  scope: { concessionId: string; assemblyId?: string },
  input: AgentAssignmentInput,
  context: { actorId: string; requestId: string },
) {
  if (scope.assemblyId && scope.assemblyId !== assemblyId) return null;
  const assembly = await prisma.assembly.findFirst({
    where: { id: assemblyId, concessions: { some: { concessionId: scope.concessionId } } },
  });
  if (!assembly) return null;

  return prisma.$transaction(async (tx) => {
    const assignment = await tx.agentAssignment.upsert({
      where: { assemblyId_agentEmail: { assemblyId, agentEmail: input.agentEmail } },
      create: {
        assemblyId,
        agentEmail: input.agentEmail,
        agentName: input.agentName,
        agentSubject: input.agentSubject || null,
        zoneId: input.zoneId ?? null,
        assignedBy: context.actorId,
      },
      update: {
        agentName: input.agentName,
        agentSubject: input.agentSubject || null,
        zoneId: input.zoneId ?? null,
        assignedBy: context.actorId,
      },
    });
    await writeAudit(tx, {
      actorId: context.actorId,
      concessionId: scope.concessionId,
      assemblyId,
      action: 'agent.assigned',
      resourceType: 'AgentAssignment',
      resourceId: assignment.id,
      requestId: context.requestId,
      outcome: 'SUCCESS',
      humanReadable: `Assigned ${input.agentName} to ${assembly.assemblyName}${input.zoneId ? ' for a GIS zone' : ''}.`,
      metadata: { agentEmail: input.agentEmail, zoneId: input.zoneId ?? null },
    });
    return assignment;
  });
}

export async function removeAgent(
  prisma: PrismaClient,
  assemblyId: string,
  agentId: string,
  scope: { concessionId: string; assemblyId?: string },
  context: { actorId: string; requestId: string },
) {
  if (scope.assemblyId && scope.assemblyId !== assemblyId) return null;
  const assignment = await prisma.agentAssignment.findFirst({
    where: {
      id: agentId,
      assemblyId,
      assembly: { concessions: { some: { concessionId: scope.concessionId } } },
    },
  });
  if (!assignment) return null;
  await prisma.$transaction(async (tx) => {
    await tx.agentAssignment.delete({ where: { id: assignment.id } });
    await writeAudit(tx, {
      actorId: context.actorId,
      concessionId: scope.concessionId,
      assemblyId,
      action: 'agent.unassigned',
      resourceType: 'AgentAssignment',
      resourceId: assignment.id,
      requestId: context.requestId,
      outcome: 'SUCCESS',
      humanReadable: `Removed ${assignment.agentName} from this assembly.`,
      metadata: { agentEmail: assignment.agentEmail },
    });
  });
  return { removed: true };
}
