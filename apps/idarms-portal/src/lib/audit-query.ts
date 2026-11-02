import type { AuditFilterState } from './audit';

export type PageSearchParams = Record<string, string | string[] | undefined>;

export function firstParam(value: string | string[] | undefined): string | undefined {
  return Array.isArray(value) ? value[0] : value;
}

export function parseAuditFilters(
  params: PageSearchParams,
  pageSize = 10,
): AuditFilterState {
  const actionValue = firstParam(params.action) || undefined;
  const actionPrefixParam = firstParam(params.actionPrefix) || undefined;
  const actionPrefix = actionPrefixParam
    || (actionValue?.endsWith('*') ? actionValue.slice(0, -1) : undefined);
  const action = actionValue && !actionValue.endsWith('*') ? actionValue : undefined;
  const pageValue = Number(firstParam(params.page) ?? '1');

  return {
    page: Number.isFinite(pageValue) && pageValue > 0 ? Math.floor(pageValue) : 1,
    pageSize,
    from: firstParam(params.from) || undefined,
    to: firstParam(params.to) || undefined,
    action,
    actionPrefix,
    actorId: firstParam(params.actorId) || undefined,
  };
}

export function auditApiQuery(filters: AuditFilterState, assemblyId?: string): string {
  const params = new URLSearchParams();
  params.set('page', String(filters.page));
  params.set('pageSize', String(filters.pageSize));
  if (filters.from) params.set('from', filters.from);
  if (filters.to) params.set('to', filters.to);
  if (filters.action) params.set('action', filters.action);
  if (filters.actionPrefix) params.set('actionPrefix', filters.actionPrefix);
  if (filters.actorId) params.set('actorId', filters.actorId);
  if (assemblyId) params.set('assemblyId', assemblyId);
  return params.toString();
}
