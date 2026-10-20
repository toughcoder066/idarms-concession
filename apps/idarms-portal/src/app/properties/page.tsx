import Link from 'next/link';
import { idarmsGet } from '@/lib/api';

interface Property {
  id: string;
  reference: string;
  ratepayerId: string;
  propertyType: string;
  status: string;
}

export default async function PropertiesPage() {
  const payload = await idarmsGet<{ data: Property[] }>('properties', '/properties');
  const properties = payload?.data ?? [];

  return (
    <section>
      <div className="page-heading">
        <div>
          <p className="eyebrow">Property operations</p>
          <h1>Properties</h1>
          <p className="muted">Browse the local property register and verification status.</p>
        </div>
        <Link href="/properties/new" className="button">Register property</Link>
      </div>
      <div className="panel">
        {properties.length === 0 ? (
          <p className="muted">No properties synced yet.</p>
        ) : (
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Reference</th>
                  <th>Ratepayer</th>
                  <th>Type</th>
                  <th>Status</th>
                </tr>
              </thead>
              <tbody>
                {properties.map((p) => (
                  <tr key={p.id}>
                    <td>{p.reference}</td>
                    <td>{p.ratepayerId}</td>
                    <td>{p.propertyType}</td>
                    <td><span className="badge">{p.status}</span></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </section>
  );
}
