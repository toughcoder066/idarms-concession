import { idarmsGet } from '@/lib/api';

interface Payment {
  id: string;
  billId: string;
  amount: string;
  currency?: string;
  channel: string;
  reference?: string;
  externalReference?: string | null;
  gatewayRef?: string;
  status: string;
}

function paymentReference(payment: Payment): string {
  return payment.externalReference ?? payment.reference ?? payment.gatewayRef ?? '—';
}

export default async function PaymentsPage() {
  const payload = await idarmsGet<{ data: Payment[] }>('payments', '/payments');
  const payments = payload?.data ?? [];

  return (
    <section>
      <div className="page-heading">
        <div>
          <p className="eyebrow">Financial operations</p>
          <h1>Payments</h1>
          <p className="muted">Review payment activity and its current status.</p>
        </div>
      </div>
      <div className="panel">
        {payments.length === 0 ? (
          <p className="muted">No payments recorded yet.</p>
        ) : (
          <div className="table-wrap">
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
                    <td>{paymentReference(p)}</td>
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
