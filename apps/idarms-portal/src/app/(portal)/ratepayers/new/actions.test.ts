import type { Session } from 'next-auth';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const state = vi.hoisted(() => ({
  session: null as Session | null,
  assembly: null as { croipAssemblyId?: string | null } | null,
  croipCalls: [] as unknown[],
  staffRefs: [] as unknown[],
  propertyResponse: { ok: true, status: 201, body: undefined as unknown } as { ok: boolean; status: number; body?: unknown; message?: string },
}));

vi.mock('@/auth', () => ({ auth: async () => state.session }));
vi.mock('@/lib/api', () => ({ idarmsGet: async () => state.assembly }));
vi.mock('@/lib/croip', () => ({
  registerRatepayer: async (input: unknown) => {
    state.croipCalls.push(input);
    return { ok: true, status: 201 };
  },
  registerProperty: async (input: unknown, staffRef: unknown) => {
    state.croipCalls.push(input);
    state.staffRefs.push(staffRef);
    return state.propertyResponse;
  },
}));

const { submitRatepayer } = await import('./actions');
const { submitProperty } = await import('../../properties/new/actions');

const CROIP_ASSEMBLY = '0b7e5c9a-1d2e-4f3a-8b4c-5d6e7f8a9b0c';
const OTHER_CROIP_ASSEMBLY = '1c8f6d0b-2e3f-4a4b-9c5d-6e7f8a9b0c1d';

function session(roles: string[], overrides: Partial<Session> = {}): Session {
  return {
    user: { name: 'Ama' },
    expires: '2099-01-01T00:00:00.000Z',
    userId: 'user-1',
    roles,
    permissions: [],
    assemblyIds: ['asm-1'],
    concessionId: 'conc-1',
    assemblyId: 'asm-1',
    scopeLevel: 'ASSEMBLY',
    ...overrides,
  };
}

const ratepayer = (assemblyId: string) => ({
  ratepayerType: 'INDIVIDUAL' as const,
  legalName: 'Kofi Mensah',
  phone: '0244000000',
  regionId: CROIP_ASSEMBLY,
  assemblyId,
  latitude: 5.6,
  longitude: -0.2,
});

beforeEach(() => {
  state.croipCalls = [];
  state.staffRefs = [];
  state.assembly = { croipAssemblyId: CROIP_ASSEMBLY };
  state.propertyResponse = { ok: true, status: 201, body: { id: 'prop-1', code: 'PROP-2026-AAAA-BBBB', assemblyId: CROIP_ASSEMBLY } };
});

describe('ratepayer registration checks the user before CROIP (T2)', () => {
  it("registers in the user's own CROIP assembly", async () => {
    state.session = session(['ASSEMBLY_ADMIN']);
    expect(await submitRatepayer(ratepayer(CROIP_ASSEMBLY.toUpperCase()))).toMatchObject({ ok: true });
    expect(state.croipCalls).toHaveLength(1);
  });

  it('refuses a user without ratepayer:create and calls nothing', async () => {
    state.session = session(['FIELD_AGENT']);
    expect(await submitRatepayer(ratepayer(CROIP_ASSEMBLY))).toMatchObject({ ok: false, status: 403 });
    expect(state.croipCalls).toHaveLength(0);
  });

  it('refuses another assembly chosen in the form', async () => {
    state.session = session(['SECRETARY']);
    expect(await submitRatepayer(ratepayer(OTHER_CROIP_ASSEMBLY))).toMatchObject({ ok: false, status: 403 });
    expect(state.croipCalls).toHaveLength(0);
  });

  it('refuses when the assembly has no CROIP id recorded', async () => {
    state.session = session(['SECRETARY']);
    state.assembly = { croipAssemblyId: null };
    expect(await submitRatepayer(ratepayer(CROIP_ASSEMBLY))).toMatchObject({ ok: false, status: 409 });
    expect(state.croipCalls).toHaveLength(0);
  });

  it('refuses the super admin at concession level', async () => {
    state.session = session(['CONCESSION_SUPER_ADMIN'], { scopeLevel: 'CONCESSION', assemblyId: undefined });
    expect(await submitRatepayer(ratepayer(CROIP_ASSEMBLY))).toMatchObject({ ok: false, status: 403 });
    expect(state.croipCalls).toHaveLength(0);
  });

  it('refuses without a session', async () => {
    state.session = null;
    expect(await submitRatepayer(ratepayer(CROIP_ASSEMBLY))).toMatchObject({ ok: false, status: 401 });
    expect(state.croipCalls).toHaveLength(0);
  });
});

describe('property registration checks the user before CROIP (T2)', () => {
  const property = {
    propertyClass: 'COMMERCIAL_CLASS_1',
    buildingStatus: 'COMPLETED',
    propertyStatus: 'UNASSESSED',
    propertyUse: 'COMMERCIAL',
    tenureType: 'FREEHOLD',
    structureType: 'CONCRETE',
    polygonGeoJson: '{"type":"Polygon","coordinates":[]}',
    idempotencyKey: 'key-1',
  };

  it('allows a role with property:create and returns CROIP’s record', async () => {
    state.session = session(['SECRETARY']);
    expect(await submitProperty(property)).toMatchObject({
      ok: true,
      property: { id: 'prop-1', code: 'PROP-2026-AAAA-BBBB', assemblyId: CROIP_ASSEMBLY },
      assemblyMismatch: false,
    });
    expect(state.croipCalls).toHaveLength(1);
  });

  it('sends the signed-in user’s iDARMS id as staffRef, ignoring any staffRef in the form', async () => {
    state.session = session(['SECRETARY']);
    await submitProperty({ ...property, staffRef: 'forged' } as typeof property);
    expect(state.staffRefs).toEqual(['user-1']);
  });

  it('flags a property CROIP placed in another of our assemblies', async () => {
    state.session = session(['SECRETARY']);
    state.propertyResponse = { ok: true, status: 201, body: { id: 'prop-2', code: 'PROP-2026-CCCC-DDDD', assemblyId: OTHER_CROIP_ASSEMBLY } };
    expect(await submitProperty(property)).toMatchObject({ ok: true, assemblyMismatch: true });
  });

  it('passes CROIP’s refusal through', async () => {
    state.session = session(['SECRETARY']);
    state.propertyResponse = { ok: false, status: 403, message: 'Concession is not authorized to register properties outside of its assigned MMDA.' };
    expect(await submitProperty(property)).toMatchObject({ ok: false, status: 403, message: expect.stringContaining('assigned MMDA') });
  });

  it('refuses when the assembly has no CROIP id recorded', async () => {
    state.session = session(['SECRETARY']);
    state.assembly = { croipAssemblyId: null };
    expect(await submitProperty(property)).toMatchObject({ ok: false, status: 409 });
    expect(state.croipCalls).toHaveLength(0);
  });

  it('refuses a session with no staff identity', async () => {
    state.session = session(['SECRETARY'], { userId: '' });
    expect(await submitProperty(property)).toMatchObject({ ok: false, status: 401 });
    expect(state.croipCalls).toHaveLength(0);
  });

  it('refuses a role without property:create and calls nothing', async () => {
    state.session = session(['FIELD_AGENT']);
    expect(await submitProperty(property)).toMatchObject({ ok: false, status: 403 });
    expect(state.croipCalls).toHaveLength(0);
  });
});
