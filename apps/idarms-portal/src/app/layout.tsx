import type { Metadata } from 'next';
import Link from 'next/link';
import './globals.css';

export const metadata: Metadata = {
  title: 'iDARMS Portal',
  description: 'Concessionaire admin & field agent UI',
};

const nav = [
  { href: '/', label: 'Home' },
  { href: '/dashboard', label: 'Dashboard' },
  { href: '/ratepayers', label: 'Ratepayers' },
  { href: '/properties', label: 'Properties' },
  { href: '/billing', label: 'Billing' },
  { href: '/payments', label: 'Payments' },
];

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>
        <header className="topbar">
          <Link href="/" className="brand">iDARMS</Link>
          <nav>
            {nav.map((item) => (
              <Link key={item.href} href={item.href}>{item.label}</Link>
            ))}
          </nav>
        </header>
        <main className="container">{children}</main>
      </body>
    </html>
  );
}
