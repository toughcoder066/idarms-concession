import { idarmsGet } from '@/lib/api';

interface Payment {
  id: string;
  billId: string;
  amount: string;
  channel: string;
  gatewayRef: string;
  status: string;
}

export default async function PaymentsPage() {
  const payload = await idarmsGet<{ data: Payment[] }>('/payments');
  const payments = payload?.data ?? [];

  return (
    <section>
      <h1>Payments</h1>
      <div className="panel">
        {payments.length === 0 ? (
          <p className="muted">No payments recorded yet.</p>
        ) : (
          <table>
            <thead>
              <tr>
                <th>Bill</th>
                <th>Amount</th>
                <th>Channel</th>
                <th>Gateway ref</th>
                <th>Status</th>
              </tr>
            </thead>
            <tbody>
              {payments.map((p) => (
                <tr key={p.id}>
                  <td>{p.billId}</td>
                  <td>{p.amount}</td>
                  <td>{p.channel}</td>
                  <td>{p.gatewayRef}</td>
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
