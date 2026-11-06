import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('./m2m', () => ({ getMachineToken: async () => 'machine-token' }));

const { registerProperty } = await import('./croip');

const polygon = { type: 'Polygon', coordinates: [[[-0.2355, 5.5545], [-0.2355, 5.5555], [-0.2345, 5.5555], [-0.2345, 5.5545], [-0.2355, 5.5545]]] };

const input = {
  propertyClass: 'COMMERCIAL_CLASS_1',
  buildingStatus: 'COMPLETED',
  propertyStatus: 'UNASSESSED',
  propertyUse: 'COMMERCIAL',
  tenureType: 'FREEHOLD',
  structureType: 'CONCRETE',
  polygonGeoJson: JSON.stringify(polygon),
  idempotencyKey: '7d1e1c52-5b1a-4f7e-9d0c-2a7f1b3c4d5e',
};

let calls: Array<{ url: string; init: RequestInit }> = [];

beforeEach(() => {
  calls = [];
  vi.stubGlobal('fetch', async (url: string, init: RequestInit) => {
    calls.push({ url, init });
    return new Response(JSON.stringify({ id: 'p1', code: 'PROP-2026-AAAA-BBBB', assemblyId: 'a1' }), { status: 201 });
  });
});

afterEach(() => vi.unstubAllGlobals());

describe('registerProperty matches CROIP POST /v1/properties @ 9be15da', () => {
  it('sends exactly the fields CROIP accepts, with staffRef and idempotencyKey', async () => {
    const result = await registerProperty({ ...input, accountNumber: ' ACC-1 ', numberOfFloors: 2, ghanaPostGps: 'GA-123-4567' }, 'user-1');

    expect(result).toMatchObject({ ok: true, status: 201 });
    expect(calls).toHaveLength(1);
    expect(calls[0].url).toMatch(/\/v1\/properties$/);
    expect(new Headers(calls[0].init.headers).get('authorization')).toBe('Bearer machine-token');
    expect(JSON.parse(String(calls[0].init.body))).toEqual({
      propertyClass: 'COMMERCIAL_CLASS_1',
      buildingStatus: 'COMPLETED',
      propertyStatus: 'UNASSESSED',
      propertyUse: 'COMMERCIAL',
      tenureType: 'FREEHOLD',
      structureType: 'CONCRETE',
      accountNumber: 'ACC-1',
      numberOfFloors: 2,
      ghanaPostGps: 'GA-123-4567',
      polygonGeoJson: polygon,
      staffRef: 'user-1',
      idempotencyKey: input.idempotencyKey,
    });
  });

  it('never sends code, propertyName, registrationSource or assemblyId', async () => {
    await registerProperty(input, 'user-1');
    const body = JSON.parse(String(calls[0].init.body));
    for (const field of ['code', 'propertyName', 'registrationSource', 'assemblyId', 'concessionId']) {
      expect(body).not.toHaveProperty(field);
    }
  });

  it('sends the same body on a retry with the same key', async () => {
    await registerProperty(input, 'user-1');
    await registerProperty(input, 'user-1');
    expect(calls[0].init.body).toBe(calls[1].init.body);
  });

  it.each(['propertyClass', 'buildingStatus', 'propertyStatus', 'propertyUse', 'tenureType', 'structureType'] as const)(
    'refuses locally when %s is missing',
    async (field) => {
      expect(await registerProperty({ ...input, [field]: '  ' }, 'user-1')).toMatchObject({ ok: false, status: 400 });
      expect(calls).toHaveLength(0);
    },
  );

  it('refuses locally without a staffRef or idempotencyKey', async () => {
    expect(await registerProperty(input, '')).toMatchObject({ ok: false, status: 400 });
    expect(await registerProperty({ ...input, idempotencyKey: '' }, 'user-1')).toMatchObject({ ok: false, status: 400 });
    expect(calls).toHaveLength(0);
  });

  it('refuses a fractional or zero floor count and a non-polygon boundary', async () => {
    expect(await registerProperty({ ...input, numberOfFloors: 0 }, 'user-1')).toMatchObject({ ok: false, status: 400 });
    expect(await registerProperty({ ...input, numberOfFloors: 1.5 }, 'user-1')).toMatchObject({ ok: false, status: 400 });
    expect(await registerProperty({ ...input, polygonGeoJson: '{"type":"Point","coordinates":[0,0]}' }, 'user-1')).toMatchObject({ ok: false, status: 400 });
    expect(calls).toHaveLength(0);
  });

  it('passes CROIP’s problem title through', async () => {
    vi.stubGlobal('fetch', async () => new Response(JSON.stringify({ title: 'Property boundary conflict', status: 409 }), { status: 409 }));
    expect(await registerProperty(input, 'user-1')).toMatchObject({ ok: false, status: 409, message: 'Property boundary conflict' });
  });
});
