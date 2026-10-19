import Link from 'next/link';
import { idarmsGet } from '@/lib/api';

interface Ratepayer {
  id: string;
  reference: string;
  fullName: string;
  phone?: string | null;
  email?: string | null;
  status: string;
}

export default async function RatepayersPage() {
  const payload = await idarmsGet<{ data: Ratepayer[] }>('/ratepayers');
  const ratepayers = payload?.data ?? [];

  return (
    <section>
      <h1>Ratepayers</h1>
      <div className="actions">
        <Link href="/ratepayers/new" className="button">Register ratepayer</Link>
      </div>
      <div className="panel">
        {ratepayers.length === 0 ? (
          <p className="muted">No ratepayers synced yet. Register one via CROIP and let the sync bridge pull it down.</p>
        ) : (
          <table>
            <thead>
              <tr>
                <th>Reference</th>
                <th>Name</th>
                <th>Phone</th>
                <th>Status</th>
              </tr>
            </thead>
            <tbody>
              {ratepayers.map((r) => (
                <tr key={r.id}>
                  <td>{r.reference}</td>
                  <td>{r.fullName}</td>
                  <td>{r.phone ?? '—'}</td>
                  <td><span className="badge">{r.status}</span></td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </section>
  );
}
