'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { FileSpreadsheet } from 'lucide-react';
import { BulkImportModal } from './bulk-import-modal';

export function BulkImportLauncher({
  assemblyOptions,
  label = 'Bulk import',
}: {
  assemblyOptions: Array<{ assemblyId: string; assemblyName: string | null; assemblyCode: string | null }>;
  label?: string;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);

  return (
    <>
      <button type="button" className="button button-secondary button-compact" onClick={() => setOpen(true)}>
        <FileSpreadsheet size={14} aria-hidden="true" /> {label}
      </button>
      <BulkImportModal
        open={open}
        onClose={() => setOpen(false)}
        assemblyOptions={assemblyOptions}
        onCommitted={() => router.refresh()}
      />
    </>
  );
}
