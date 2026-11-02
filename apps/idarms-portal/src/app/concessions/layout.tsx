import { Suspense } from 'react';
import { ConcessionScopeBar } from '@/components/concession-scope-bar';
import { ConcessionsNav } from '@/components/concessions-nav';
import { getConcessionAccess } from '@/lib/access';
import { currentFiscalYear, getAssemblies } from '@/lib/concessions';

export default async function ConcessionsLayout({ children }: { children: React.ReactNode }) {
  const access = await getConcessionAccess();
  const fiscalYear = currentFiscalYear();
  const assemblies = (await getAssemblies(fiscalYear)) ?? [];
  const generatedAt = new Intl.DateTimeFormat('en-GH', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  }).format(new Date());

  return (
    <div className="concessions-shell">
      <Suspense fallback={<div className="scope-bar-skeleton" />}>
        <ConcessionScopeBar assemblies={assemblies} access={access} fiscalYear={fiscalYear} generatedAt={generatedAt} />
      </Suspense>
      <Suspense fallback={null}>
        <ConcessionsNav />
      </Suspense>
      {children}
    </div>
  );
}
