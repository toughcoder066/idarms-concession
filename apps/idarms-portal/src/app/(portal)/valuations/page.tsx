import { Banknote } from 'lucide-react';
import { ModuleWorkspace } from '@/components/module-workspace';
import { idarmsGet } from '@/lib/api';

interface ValuationRecord {
  id: string;
  propertyId: string;
  marketValue: number;
  taxableValue: number;
  fiscalYear: number;
  createdAt: string;
}

function currency(value: number) {
  return new Intl.NumberFormat('en-GH', { style: 'currency', currency: 'GHS', maximumFractionDigits: 2 }).format(value);
}

export default async function ValuationsPage() {
  const payload = await idarmsGet<{ data: ValuationRecord[] }>('valuations', '/valuations');
  const records = (payload?.data ?? []).map((record) => ({
    ...record,
    marketValue: currency(record.marketValue),
    taxableValue: currency(record.taxableValue),
    createdAt: new Intl.DateTimeFormat('en-GH', { dateStyle: 'medium' }).format(new Date(record.createdAt)),
  }));
  return (
    <ModuleWorkspace
      title="Valuations"
      eyebrow="PROPERTY ASSESSMENT"
      description="Review market and taxable values associated with registered properties."
      columns={[{ key: 'propertyId', label: 'Property ID' }, { key: 'marketValue', label: 'Market value' }, { key: 'taxableValue', label: 'Taxable value' }, { key: 'fiscalYear', label: 'Fiscal year' }, { key: 'createdAt', label: 'Assessed' }]}
      records={records}
      emptyMessage="Property assessments will appear here once valuation records are available."
      serviceAvailable={Boolean(payload)}
      icon={Banknote}
    />
  );
}
