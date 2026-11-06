import {
  isPreviewPersona,
  previewPersonaLabel,
  type PreviewPersonaKey,
} from '@idarms/contracts';
import type { PrismaClient } from '../../../generated/prisma';
import { writeAudit } from '../concessions/audit';

export interface PreviewAuditActor {
  actorId: string;
  actorRole: string;
  actorName?: string;
  actorEmail?: string;
  concessionId?: string;
  requestId: string;
}

export class PreviewAuditError extends Error {
  constructor(
    message: string,
    readonly code: string,
    readonly statusCode: number,
  ) {
    super(message);
    this.name = 'PreviewAuditError';
  }
}

export async function recordPreviewEntry(
  prisma: PrismaClient,
  actor: PreviewAuditActor,
  persona: string,
): Promise<{ persona: PreviewPersonaKey; label: string; recorded: true }> {
  if (actor.actorRole !== 'CONCESSION_SUPER_ADMIN') {
    throw new PreviewAuditError(
      'Preview mode is limited to Concession Super Admins.',
      'forbidden',
      403,
    );
  }
  if (!isPreviewPersona(persona)) {
    throw new PreviewAuditError('Unknown preview persona.', 'invalid_persona', 400);
  }

  const label = previewPersonaLabel(persona);
  await prisma.$transaction((tx) => writeAudit(tx, {
    actorId: actor.actorId,
    actorRole: actor.actorRole,
    actorName: actor.actorName,
    actorEmail: actor.actorEmail,
    concessionId: actor.concessionId,
    action: 'preview.entered',
    resourceType: 'PreviewPersona',
    resourceId: persona,
    requestId: actor.requestId,
    outcome: 'SUCCESS',
    humanReadable: `Entered preview mode for the simulated ${label} view.`,
    metadata: {
      persona,
      personaLabel: label,
      simulated: true,
      readOnly: true,
    },
  }));

  return { persona, label, recorded: true };
}
