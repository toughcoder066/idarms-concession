import { RefreshCw } from 'lucide-react';
import { ModuleWorkspace } from '@/components/module-workspace';
import { idarmsGet } from '@/lib/api';

interface SyncRecord {
  id: string;
  entityType: string;
  entityId: string;
  direction: string;
  status: string;
  croipReference?: string | null;
  lastSyncedAt: string;
}

export default async function SyncPage() {
  const payload = await idarmsGet<{ data: SyncRecord[] }>('sync', '/sync');
  const records = (payload?.data ?? []).map((record) => ({
    ...record,
    croipReference: record.croipReference ?? '—',
    lastSyncedAt: new Intl.DateTimeFormat('en-GH', { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(record.lastSyncedAt)),
  }));
  return (
    <ModuleWorkspace
      title="CROIP sync"
      eyebrow="INTEGRATION MONITOR"
      description="Monitor records exchanged between iDARMS and the CROIP integration service."
      columns={[{ key: 'entityType', label: 'Record type' }, { key: 'entityId', label: 'iDARMS record ID' }, { key: 'direction', label: 'Direction' }, { key: 'status', label: 'Sync status' }, { key: 'croipReference', label: 'CROIP reference' }, { key: 'lastSyncedAt', label: 'Last synced' }]}
      records={records}
      emptyMessage="Sync activity will appear here after the integration service records an exchange."
      serviceAvailable={Boolean(payload)}
      icon={RefreshCw}
    />
  );
}
