import { AuditTable } from '@/components/audit-table';
import { getAudit } from '@/lib/concessions';

export default async function AuditPage() {
  const records = (await getAudit(300)) ?? [];
  return (
    <section className="concession-page">
      <div className="concession-page-heading">
        <div><p className="eyebrow">Accountability</p><h1>Audit ledger</h1><p>Every concession configuration and approval decision is recorded with a human-readable description.</p></div>
      </div>
      <AuditTable records={records} />
    </section>
  );
}
