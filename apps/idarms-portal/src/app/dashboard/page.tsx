import { idarmsGet } from '@/lib/api';

interface DashboardMetric {
  id: string;
  date: string;
  totalBilled: string;
  totalCollected: string;
  propertiesVerified: number;
}

export default async function DashboardPage() {
  const payload = await idarmsGet<{ data: DashboardMetric[] }>('dashboard', '/dashboard/metrics');
  const metrics = payload?.data ?? [];

  return (
    <section>
      <h1>Dashboard</h1>
      <div className="panel">
        {metrics.length === 0 ? (
          <p className="muted">No metrics yet — start the reporting-service and process events.</p>
        ) : (
          <table>
            <thead>
              <tr>
                <th>Date</th>
                <th>Total billed</th>
                <th>Total collected</th>
                <th>Properties verified</th>
              </tr>
            </thead>
            <tbody>
              {metrics.map((m) => (
                <tr key={m.id}>
                  <td>{m.date}</td>
                  <td>{m.totalBilled}</td>
                  <td>{m.totalCollected}</td>
                  <td>{m.propertiesVerified}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </section>
  );
}
