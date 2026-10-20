import { idarmsGet } from '@/lib/api';

interface Bill {
  id: string;
  billNumber: string;
  propertyId: string;
  amountDue: string;
  amountPaid: string;
  status: string;
  fiscalYear: number;
}

export default async function BillingPage() {
  const payload = await idarmsGet<{ data: Bill[] }>('bills', '/bills');
  const bills = payload?.data ?? [];

  return (
    <section>
      <div className="page-heading">
        <div>
          <p className="eyebrow">Financial operations</p>
          <h1>Billing</h1>
          <p className="muted">Review bills issued for properties in this workspace.</p>
        </div>
      </div>
      <div className="panel">
        {bills.length === 0 ? (
          <p className="muted">No bills generated yet.</p>
        ) : (
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Bill number</th>
                  <th>Property</th>
                  <th>Year</th>
                  <th>Amount due</th>
                  <th>Amount paid</th>
                  <th>Status</th>
                </tr>
              </thead>
              <tbody>
                {bills.map((b) => (
                  <tr key={b.id}>
                    <td>{b.billNumber}</td>
                    <td>{b.propertyId}</td>
                    <td>{b.fiscalYear}</td>
                    <td>{b.amountDue}</td>
                    <td>{b.amountPaid}</td>
                    <td><span className="badge">{b.status}</span></td>
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
