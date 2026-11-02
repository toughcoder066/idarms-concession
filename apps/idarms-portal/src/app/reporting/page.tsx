import { BarChart3 } from 'lucide-react';
import { ModuleWorkspace } from '@/components/module-workspace';
import { idarmsGet } from '@/lib/api';

interface ReportingRecord {
  id: string;
  date: string;
  totalBilled: string | number;
  totalCollected: string | number;
  propertiesVerified: number;
}

function currency(value: string | number) {
  return new Intl.NumberFormat('en-GH', { style: 'currency', currency: 'GHS', maximumFractionDigits: 2 }).format(Number(value) || 0);
}

export default async function ReportingPage() {
  const payload = await idarmsGet<{ data: ReportingRecord[] }>('dashboard', '/dashboard/metrics');
  const records = (payload?.data ?? []).map((record) => ({
    ...record,
    date: new Intl.DateTimeFormat('en-GH', { dateStyle: 'medium' }).format(new Date(record.date)),
    totalBilled: currency(record.totalBilled),
    totalCollected: currency(record.totalCollected),
  }));
  return (
    <ModuleWorkspace
      title="Reporting"
      eyebrow="REVENUE & OPERATIONS ANALYTICS"
      description="Review reported collections, billing totals, and property verification activity over time."
      columns={[{ key: 'date', label: 'Reporting date' }, { key: 'totalBilled', label: 'Total billed' }, { key: 'totalCollected', label: 'Total collected' }, { key: 'propertiesVerified', label: 'Properties verified' }]}
      records={records}
      emptyMessage="Daily reporting records will appear here after they are published to the reporting service."
      serviceAvailable={Boolean(payload)}
      icon={BarChart3}
    />
  );
}
