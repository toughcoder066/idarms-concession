import Link from 'next/link';

const cards = [
  { href: '/ratepayers/new', title: 'Register Ratepayer', text: 'CQRS write direct to CROIP Apex API' },
  { href: '/ratepayers', title: 'Ratepayers', text: 'Search the local ratepayer replica' },
  { href: '/properties', title: 'Properties', text: 'Local property registry & verifications' },
  { href: '/billing', title: 'Billing', text: 'Generated bills and balances' },
  { href: '/payments', title: 'Payments', text: 'Payment history and status' },
  { href: '/dashboard', title: 'Dashboard', text: 'Operational KPIs from reporting-service' },
];

export default function HomePage() {
  return (
    <section className="hero">
      <h1>iDARMS Concessionaire Portal</h1>
      <p className="muted">
        Local operational terminal for ratepayers, properties, billing and payments.
      </p>
      <div className="cards">
        {cards.map((card) => (
          <Link key={card.href} href={card.href} className="card">
            <h3>{card.title}</h3>
            <p>{card.text}</p>
          </Link>
        ))}
      </div>
    </section>
  );
}
