'use server';

import { idarmsRequest } from '@/lib/api';
import type { BulkImportBatchDetail } from '@/lib/staff';

export async function loadAuditBatchAction(
  assemblyId: string,
  batchId: string,
) {
  return idarmsRequest<BulkImportBatchDetail>(
    'concessions',
    `/assemblies/${encodeURIComponent(assemblyId)}/staff/bulk-import/${encodeURIComponent(batchId)}`,
  );
}
