import { describe, expect, it } from 'vitest';
import type { PrismaClient } from '../../../generated/prisma';
import {
  recordPreviewEntry,
  PreviewAuditError,
  type PreviewAuditActor,
} from './service';

function createPrisma() {
  const created: Array<Record<string, any>> = [];
  const prisma = {
    $transaction: async (callback: (tx: any) => Promise<unknown>) => callback({
      auditRecord: {
        create: async ({ data }: { data: Record<string, any> }) => {
          created.push(data);
        },
      },
    }),
  } as unknown as PrismaClient;
  return { prisma, created };
}

function actor(overrides: Partial<PreviewAuditActor> = {}): PreviewAuditActor {
  return {
    actorId: 'super-1',
    actorRole: 'CONCESSION_SUPER_ADMIN',
    actorName: 'Concession Admin',
    actorEmail: 'super@example.test',
    concessionId: 'concession-1',
    requestId: 'req-preview-1',
    ...overrides,
  };
}

describe('preview entry audit', () => {
  it('writes a structured preview.entered audit row with the persona', async () => {
    const { prisma, created } = createPrisma();
    const result = await recordPreviewEntry(prisma, actor(), 'ASSEMBLY_ADMIN');

    expect(result).toEqual({ persona: 'ASSEMBLY_ADMIN', label: 'Assembly Admin', recorded: true });
    expect(created).toHaveLength(1);
    expect(created[0]).toMatchObject({
      actorId: 'super-1',
      actorType: 'user',
      action: 'preview.entered',
      resourceType: 'PreviewPersona',
      resourceId: 'ASSEMBLY_ADMIN',
      outcome: 'SUCCESS',
      requestId: 'req-preview-1',
    });
    expect(created[0].metadata).toMatchObject({
      actorRole: 'CONCESSION_SUPER_ADMIN',
      actorName: 'Concession Admin',
      actorEmail: 'super@example.test',
      persona: 'ASSEMBLY_ADMIN',
      personaLabel: 'Assembly Admin',
      simulated: true,
      readOnly: true,
    });
  });

  it('rejects unknown personas without writing an audit row', async () => {
    const { prisma, created } = createPrisma();
    await expect(recordPreviewEntry(prisma, actor(), 'CONCESSION_SUPER_ADMIN'))
      .rejects.toMatchObject({ code: 'invalid_persona', statusCode: 400 });
    expect(created).toHaveLength(0);
  });

  it('rejects callers outside the preview role set', async () => {
    const { prisma, created } = createPrisma();
    await expect(recordPreviewEntry(prisma, actor({ actorRole: 'ASSEMBLY_ADMIN' }), 'ASSEMBLY_ADMIN'))
      .rejects.toMatchObject({ code: 'forbidden', statusCode: 403 });
    expect(created).toHaveLength(0);
  });
});
