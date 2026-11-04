import Link from 'next/link';
import { AlertTriangle, ArrowLeft, ClipboardList, ShieldAlert } from 'lucide-react';
import { AuditHistory } from '@/components/audit/audit-history';
import { getConcessionAccess } from '@/lib/access';
import { idarmsRequest } from '@/lib/api';
import {
  auditErrorMessage,
  type AuditActorOption,
  type AuditPage,
} from '@/lib/audit';
import {
  auditApiQuery,
  parseAuditFilters,
  type PageSearchParams,
} from '@/lib/audit-query';

export default async function AssemblyActivityAuditPage({
  params,
  searchParams,
}: {
  params: Promise<{ assemblyId: string }>;
  searchParams: Promise<PageSearchParams>;
}) {
  const [{ assemblyId }, query, access] = await Promise.all([
    params,
    searchParams,
    getConcessionAccess(),
  ]);
  const canView = access.roles.includes('ASSEMBLY_ADMIN')
    || access.roles.includes('CONCESSION_SUPER_ADMIN');

  if (!canView) {
    return (
      <section className="concession-page staff-page">
        <div className="staff-access-panel">
          <span className="staff-access-icon"><ShieldAlert size={24} aria-hidden="true" /></span>
          <h1>Activity &amp; Audit is not available</h1>
          <p>This screen is limited to Assembly Admins and Concession Super Admins with an explicit grant in the assembly.</p>
          <Link href="/dashboard" className="button button-secondary" prefetch={false}>
            <ArrowLeft size={14} aria-hidden="true" /> Back to dashboard
          </Link>
        </div>
      </section>
    );
  }

  const filters = parseAuditFilters(query);
  const apiQuery = auditApiQuery(filters);
  const actorQuery = auditApiQuery({ ...filters, page: 1, actorId: undefined });

  const [assemblyResult, auditResult, actorsResult] = await Promise.all([
    idarmsRequest<{ assemblyName: string; assemblyCode: string }>('concessions', `/assemblies/${assemblyId}`),
    idarmsRequest<AuditPage>('concessions', `/assemblies/${assemblyId}/audit?${apiQuery}`),
    idarmsRequest<AuditActorOption[]>('concessions', `/assemblies/${assemblyId}/audit/actors?${actorQuery}`),
  ]);

  if (!auditResult.ok) {
    const forbidden = auditResult.code === 'org_forbidden' || auditResult.code === 'concession_forbidden';
    return (
      <section className="concession-page staff-page">
        <div className="staff-access-panel" role="alert">
          <span className="staff-access-icon error"><AlertTriangle size={24} aria-hidden="true" /></span>
          <h1>{forbidden ? 'No access to this assembly' : 'Audit history unavailable'}</h1>
          <p>{auditErrorMessage(auditResult.code, auditResult.message)}</p>
          {forbidden && access.assemblyId && access.assemblyId !== assemblyId && (
            <p className="staff-access-hint">Your own assembly workspace is available at the link below.</p>
          )}
          <div className="staff-access-actions">
            {access.assemblyId && access.assemblyId !== assemblyId && (
              <Link href={`/assembly/${access.assemblyId}/activity-audit`} className="button" prefetch={false}>
                Go to my assembly
              </Link>
            )}
            <Link href="/dashboard" className="button button-secondary" prefetch={false}>Back to dashboard</Link>
          </div>
        </div>
      </section>
    );
  }

  const assemblyName = assemblyResult.ok
    ? assemblyResult.data?.assemblyName ?? 'Assembly'
    : auditResult.data?.items[0]?.assemblyName ?? 'Assembly';
  const assemblyCode = assemblyResult.ok
    ? assemblyResult.data?.assemblyCode ?? assemblyId.slice(0, 8)
    : auditResult.data?.items[0]?.assemblyCode ?? assemblyId.slice(0, 8);
  const page = auditResult.data;

  return (
    <section className="concession-page staff-page audit-page">
      <div className="concession-page-heading">
        <div>
          <p className="eyebrow">{access.roles.includes('CONCESSION_SUPER_ADMIN') ? 'Concession · assembly context' : 'Assembly administration'}</p>
          <h1>Activity &amp; Audit</h1>
          <p>{assemblyName} · {assemblyCode} · every provisioning action recorded against this assembly, including Super Admin actions.</p>
        </div>
        <span className="staff-scope-note"><ClipboardList size={13} aria-hidden="true" /> assembly-scoped</span>
      </div>

      <div className="audit-intro">
        <p>
          This timeline is limited to the selected assembly. Super Admin actions are shown as normal audit entries with a
          <span className="audit-actor-badge SUPER_ADMIN"> Super Admin</span> badge so local staff can see who acted.
        </p>
      </div>

      <AuditHistory
        basePath={`/assembly/${assemblyId}/activity-audit`}
        filters={filters}
        actors={actorsResult.ok ? actorsResult.data ?? [] : []}
        entries={page?.items ?? []}
        total={page?.total ?? 0}
        showActorFilter
        showAssemblyColumn={false}
        scopeNote="Assembly activity, newest first. Bulk import entries include a batch drill-in."
        emptyMessage="No provisioning activity matches these filters for this assembly."
      />
    </section>
  );
}
