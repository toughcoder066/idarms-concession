/**
 * Reads the concession's assigned-assembly list from croip-integration-service
 * (`GET /v1/assigned-assemblies`), which owns it. The caller's own credentials are
 * forwarded, so the list is scoped by the caller's verified token, never by input.
 */
export interface AssignedAssemblyCheckOptions {
  baseUrl: string;
  /** Request headers to forward: the bearer token, or the dev-mode x-idarms-* headers. */
  headers: Record<string, string | string[] | undefined>;
  fetchImpl?: typeof fetch;
  timeoutMs?: number;
}

const FORWARDED_HEADER = /^(authorization|x-idarms-.+)$/i;

export function assignedAssemblyChecker(options: AssignedAssemblyCheckOptions) {
  const fetchImpl = options.fetchImpl ?? fetch;
  const headers: Record<string, string> = { accept: 'application/json' };
  for (const [name, value] of Object.entries(options.headers)) {
    if (FORWARDED_HEADER.test(name) && typeof value === 'string') headers[name.toLowerCase()] = value;
  }

  return async (croipAssemblyId: string): Promise<boolean> => {
    const url = new URL('/v1/assigned-assemblies', options.baseUrl);
    const response = await fetchImpl(url, {
      headers,
      signal: AbortSignal.timeout(options.timeoutMs ?? 5_000),
    });
    if (!response.ok) {
      throw new Error(`assigned-assembly list returned ${response.status}`);
    }
    const body = await response.json() as { data?: Array<{ assemblyId?: string; assignedNow?: boolean }> };
    return (body.data ?? []).some((row) => row.assemblyId === croipAssemblyId && row.assignedNow === true);
  };
}
