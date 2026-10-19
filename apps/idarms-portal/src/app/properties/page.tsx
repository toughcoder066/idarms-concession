import { idarmsGet } from '@/lib/api';

interface Property {
  id: string;
  reference: string;
  ratepayerId: string;
  propertyType: string;
  status: string;
}

export default async function PropertiesPage() {
  const payload = await idarmsGet<{ data: Property[] }>('/properties');
  const properties = payload?.data ?? [];

  return (
    <section>
      <h1>Properties</h1>
      <div className="panel">
        {properties.length === 0 ? (
          <p className="muted">No properties synced yet.</p>
        ) : (
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
        )}
      </div>
    </section>
  );
}
