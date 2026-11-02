import { FileText } from 'lucide-react';
import { ModuleWorkspace } from '@/components/module-workspace';
import { idarmsGet } from '@/lib/api';

interface DocumentRecord {
  id: string;
  entityType: string;
  entityId: string;
  documentType: string;
  createdAt: string;
}

export default async function DocumentsPage() {
  const payload = await idarmsGet<{ data: DocumentRecord[] }>('documents', '/documents');
  const records = (payload?.data ?? []).map((record) => ({
    ...record,
    createdAt: new Intl.DateTimeFormat('en-GH', { dateStyle: 'medium' }).format(new Date(record.createdAt)),
  }));
  return (
    <ModuleWorkspace
      title="Documents"
      eyebrow="RECORDS & EVIDENCE"
      description="Browse documents attached to ratepayer and property records."
      columns={[{ key: 'documentType', label: 'Document type' }, { key: 'entityType', label: 'Attached to' }, { key: 'entityId', label: 'Record ID' }, { key: 'createdAt', label: 'Added' }]}
      records={records}
      emptyMessage="Uploaded files will appear here when they are attached to a property or ratepayer record."
      serviceAvailable={Boolean(payload)}
      icon={FileText}
    />
  );
}
