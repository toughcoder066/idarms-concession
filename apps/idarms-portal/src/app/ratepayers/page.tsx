import { RatepayerDirectory, type RatepayerRecord } from '@/components/ratepayer-directory';
import { idarmsGet } from '@/lib/api';

export default async function RatepayersPage() {
  const payload = await idarmsGet<{ data: RatepayerRecord[] }>('ratepayers', '/ratepayers');
  return <RatepayerDirectory ratepayers={payload?.data ?? []} />;
}
