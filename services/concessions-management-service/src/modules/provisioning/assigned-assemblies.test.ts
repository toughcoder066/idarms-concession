import { describe, expect, it } from 'vitest';
import { assignedAssemblyChecker } from './assigned-assemblies';

function fakeFetch(status: number, data: unknown[]) {
  const seen: { url?: string; headers?: Record<string, string> } = {};
  const fetchImpl = (async (url: URL, init?: RequestInit) => {
    seen.url = url.toString();
    seen.headers = init?.headers as Record<string, string>;
    return new Response(JSON.stringify({ data }), { status });
  }) as unknown as typeof fetch;
  return { fetchImpl, seen };
}

const rows = [
  { assemblyId: 'croip-asm-1', assignedNow: true },
  { assemblyId: 'croip-asm-2', assignedNow: false },
];

describe('assignedAssemblyChecker', () => {
  it('is true only for an assembly assigned right now', async () => {
    const { fetchImpl } = fakeFetch(200, rows);
    const isAssigned = assignedAssemblyChecker({ baseUrl: 'http://localhost:3090', headers: {}, fetchImpl });
    expect(await isAssigned('croip-asm-1')).toBe(true);
    expect(await isAssigned('croip-asm-2')).toBe(false);
    expect(await isAssigned('croip-asm-9')).toBe(false);
  });

  it('forwards only the caller credentials', async () => {
    const { fetchImpl, seen } = fakeFetch(200, rows);
    await assignedAssemblyChecker({
      baseUrl: 'http://localhost:3090',
      headers: { authorization: 'Bearer token-1', cookie: 'session=1', 'x-idarms-roles': 'CONCESSION_SUPER_ADMIN' },
      fetchImpl,
    })('croip-asm-1');
    expect(seen.url).toBe('http://localhost:3090/v1/assigned-assemblies');
    expect(seen.headers).toEqual({
      accept: 'application/json',
      authorization: 'Bearer token-1',
      'x-idarms-roles': 'CONCESSION_SUPER_ADMIN',
    });
  });

  it('throws when the list cannot be read, so onboarding fails closed', async () => {
    const { fetchImpl } = fakeFetch(403, []);
    const isAssigned = assignedAssemblyChecker({ baseUrl: 'http://localhost:3090', headers: {}, fetchImpl });
    await expect(isAssigned('croip-asm-1')).rejects.toThrow('403');
  });
});
