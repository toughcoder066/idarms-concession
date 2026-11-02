import { ArrowDownLeft } from 'lucide-react';
import { ModuleWorkspace } from '@/components/module-workspace';
import { idarmsGet } from '@/lib/api';

interface DiscrepancyRecord {
  id: string;
  billId: string;
  paymentId: string;
  reason: string;
  resolved: boolean;
  createdAt: string;
}

export default async function ReconciliationPage() {
  const payload = await idarmsGet<{ data: DiscrepancyRecord[] }>('discrepancies', '/discrepancies');
  const records = (payload?.data ?? []).map((record) => ({
    id: record.id,
    billId: record.billId,
    paymentId: record.paymentId,
    state: record.resolved ? 'Resolved' : 'Open',
    reason: record.reason.replaceAll('_', ' ').toLowerCase(),
    createdAt: new Intl.DateTimeFormat('en-GH', { dateStyle: 'medium' }).format(new Date(record.createdAt)),
  }));
  return (
    <ModuleWorkspace
      title="Reconciliation"
      eyebrow="FINANCIAL CONTROLS"
      description="Track payment-to-bill discrepancies and resolution status."
      columns={[{ key: 'reason', label: 'Discrepancy' }, { key: 'billId', label: 'Bill ID' }, { key: 'paymentId', label: 'Payment ID' }, { key: 'state', label: 'Resolution' }, { key: 'createdAt', label: 'Reported' }]}
      records={records}
      emptyMessage="No reconciliation records have been returned by the service."
      serviceAvailable={Boolean(payload)}
      icon={ArrowDownLeft}
    />
  );
}
