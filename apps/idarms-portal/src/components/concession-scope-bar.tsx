'use client';

import { Building2, Lock, RefreshCw } from 'lucide-react';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import type { AssemblySummary } from '@/lib/concessions';
import type { ConcessionAccess } from '@/lib/access';

const fiscalYears = (current: number) => [current - 1, current, current + 1];

export function ConcessionScopeBar({
  assemblies,
  access,
  fiscalYear,
  generatedAt,
}: {
  assemblies: AssemblySummary[];
  access: ConcessionAccess;
  fiscalYear: number;
  generatedAt: string;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const assemblyScopedPath = pathname === '/concessions/rates'
    || pathname === '/concessions/targets'
    || pathname === '/concessions/zones';
  const selectedAssemblyId = access.concessionWide
    ? (searchParams.get('assembly') ?? (assemblyScopedPath ? (assemblies[0]?.id ?? 'all') : 'all'))
    : (access.assemblyId ?? assemblies[0]?.id ?? '');
  const selectedAssembly = assemblies.find((assembly) => assembly.id === selectedAssemblyId)
    ?? assemblies.find((assembly) => assembly.id === access.assemblyId)
    ?? assemblies[0];
  const selectedYear = Number(searchParams.get('fy')) || fiscalYear;

  function updateParam(key: string, value: string) {
    const params = new URLSearchParams(searchParams.toString());
    if (value) params.set(key, value);
    else params.delete(key);
    const query = params.toString();
    router.push(query ? `${pathname}?${query}` : pathname);
  }

  return (
    <div className="concession-scope-bar">
      <div className="scope-bar-main">
        <span className="scope-bar-item scope-bar-concession">
          <Building2 size={15} aria-hidden="true" />
          <span><small>Concession</small><strong>{selectedAssembly?.contract?.concessionName ?? 'Concession'}</strong></span>
        </span>
        <span className="scope-divider" aria-hidden="true" />
        <span className="scope-bar-item">
          <small>Region</small>
          <strong>{selectedAssembly?.region ?? 'All regions'}</strong>
        </span>
        <span className="scope-divider" aria-hidden="true" />
        {access.concessionWide ? (
          <label className="scope-select-item">
            <small>Assembly</small>
            <select value={selectedAssemblyId} onChange={(event) => updateParam('assembly', event.target.value)} aria-label="Select assembly">
              <option value="all">All assemblies</option>
              {assemblies.map((assembly) => <option key={assembly.id} value={assembly.id}>{assembly.assemblyCode} · {assembly.assemblyName}</option>)}
            </select>
          </label>
        ) : (
          <span className="scope-bar-item scope-locked">
            <Lock size={13} aria-hidden="true" />
            <span><small>Assembly</small><strong>{selectedAssembly?.assemblyCode ?? 'Assigned assembly'}</strong></span>
          </span>
        )}
        <span className="scope-divider" aria-hidden="true" />
        <label className="scope-select-item scope-year">
          <small>Fiscal year</small>
          <select value={selectedYear} onChange={(event) => updateParam('fy', event.target.value)} aria-label="Select fiscal year">
            {fiscalYears(fiscalYear).map((year) => <option key={year} value={year}>FY {year}</option>)}
          </select>
        </label>
      </div>
      <div className="scope-bar-meta">
        <span>Data as of {generatedAt}</span>
        <button type="button" className="scope-refresh" onClick={() => router.refresh()} aria-label="Refresh data"><RefreshCw size={13} aria-hidden="true" /> Refresh</button>
      </div>
    </div>
  );
}
