import Link from 'next/link';
import { Filter, RotateCcw } from 'lucide-react';
import { AUDIT_ACTION_FILTERS, getRoleDefinition } from '@idarms/contracts';
import { AuditEventTable } from './audit-event-table';
import {
  toDateInputValue,
  type AuditActorOption,
  type AuditEntry,
  type AuditFilterState,
} from '@/lib/audit';

function roleLabel(role: string | null): string {
  if (!role) return 'Unknown role';
  return getRoleDefinition(role)?.displayName ?? role;
}

function filterActionValue(filters: AuditFilterState): string {
  if (filters.actionPrefix) return `${filters.actionPrefix}*`;
  return filters.action ?? '';
}

function hrefFor(
  basePath: string,
  filters: AuditFilterState,
  hiddenParams: Record<string, string>,
  overrides: { page?: number } = {},
): string {
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(hiddenParams)) params.set(key, value);
  const page = overrides.page ?? filters.page;
  if (page > 1) params.set('page', String(page));
  if (filters.from) params.set('from', filters.from);
  if (filters.to) params.set('to', filters.to);
  if (filters.action) params.set('action', filters.action);
  if (filters.actionPrefix) params.set('actionPrefix', filters.actionPrefix);
  if (filters.actorId) params.set('actorId', filters.actorId);
  const query = params.toString();
  return query ? `${basePath}?${query}` : basePath;
}

export function AuditHistory({
  basePath,
  filters,
  actors,
  entries,
  total,
  showActorFilter = true,
  showAssemblyColumn = false,
  hiddenParams = {},
  emptyMessage,
  scopeNote,
}: {
  basePath: string;
  filters: AuditFilterState;
  actors: AuditActorOption[];
  entries: AuditEntry[];
  total: number;
  showActorFilter?: boolean;
  showAssemblyColumn?: boolean;
  hiddenParams?: Record<string, string>;
  emptyMessage?: string;
  scopeNote?: string;
}) {
  const currentAction = filterActionValue(filters);
  const knownAction = AUDIT_ACTION_FILTERS.some((option) => (
    option.prefix ? `${option.value}*` === currentAction : option.value === currentAction
  ));
  const totalPages = Math.max(1, Math.ceil(total / filters.pageSize));
  const start = total === 0 ? 0 : (filters.page - 1) * filters.pageSize + 1;
  const end = Math.min(total, filters.page * filters.pageSize);
  const resetHref = hrefFor(basePath, {
    ...filters,
    page: 1,
    from: undefined,
    to: undefined,
    action: undefined,
    actionPrefix: undefined,
    actorId: undefined,
  }, hiddenParams);

  return (
    <section className="directory-card audit-card">
      <div className="directory-heading">
        <div className="directory-title">
          <span className="directory-title-icon"><Filter size={17} aria-hidden="true" /></span>
          <div>
            <h2>Audit history</h2>
            <p>{scopeNote ?? 'Assembly-scoped provisioning activity, newest first.'}</p>
          </div>
        </div>
        <span className="staff-scope-note">{total} entries · page {filters.page} of {totalPages}</span>
      </div>

      <form method="get" action={basePath} className="audit-filter-form">
        {Object.entries(hiddenParams).map(([key, value]) => (
          <input key={key} type="hidden" name={key} value={value} />
        ))}
        <div className="audit-filter-grid">
          <label className="field">
            From
            <input type="date" name="from" defaultValue={toDateInputValue(filters.from)} />
          </label>
          <label className="field">
            To
            <input type="date" name="to" defaultValue={toDateInputValue(filters.to)} />
          </label>
          <label className="field">
            Action type
            <select name="action" defaultValue={currentAction}>
              <option value="">All actions</option>
              {AUDIT_ACTION_FILTERS.map((option) => (
                <option key={option.value} value={option.prefix ? `${option.value}*` : option.value}>
                  {option.label}
                </option>
              ))}
              {currentAction && !knownAction && (
                <option value={currentAction}>Custom: {currentAction}</option>
              )}
            </select>
          </label>
          {showActorFilter && actors.length > 0 && (
            <label className="field">
              Actor
              <select name="actorId" defaultValue={filters.actorId ?? ''}>
                <option value="">All actors</option>
                {actors.map((actor) => (
                  <option key={actor.actorId} value={actor.actorId}>
                    {actor.name ?? actor.actorId} · {roleLabel(actor.role)}
                  </option>
                ))}
              </select>
            </label>
          )}
        </div>
        <div className="audit-filter-actions">
          <button type="submit" className="button button-compact">
            <Filter size={14} aria-hidden="true" /> Apply filters
          </button>
          <Link href={resetHref} className="button button-secondary button-compact" prefetch={false}>
            <RotateCcw size={14} aria-hidden="true" /> Reset
          </Link>
          <span className="audit-filter-count">Showing {start}–{end} of {total}</span>
        </div>
      </form>

      <AuditEventTable
        entries={entries}
        showAssemblyColumn={showAssemblyColumn}
        emptyMessage={emptyMessage}
      />

      {totalPages > 1 && (
        <div className="audit-pagination">
          <span>Page {filters.page} of {totalPages}</span>
          <div className="audit-pagination-actions">
            {filters.page > 1 ? (
              <Link
                href={hrefFor(basePath, filters, hiddenParams, { page: filters.page - 1 })}
                className="button button-secondary button-compact"
                prefetch={false}
              >
                Previous
              </Link>
            ) : (
              <span className="button button-secondary button-compact disabled" aria-disabled="true">Previous</span>
            )}
            {filters.page < totalPages ? (
              <Link
                href={hrefFor(basePath, filters, hiddenParams, { page: filters.page + 1 })}
                className="button button-secondary button-compact"
                prefetch={false}
              >
                Next
              </Link>
            ) : (
              <span className="button button-secondary button-compact disabled" aria-disabled="true">Next</span>
            )}
          </div>
        </div>
      )}
    </section>
  );
}
