'use client';

import Link from 'next/link';
import { usePathname, useSearchParams } from 'next/navigation';

const tabs = [
  { href: '/concessions', label: 'Overview' },
  { href: '/concessions/assemblies', label: 'Assemblies' },
  { href: '/concessions/contracts', label: 'Contracts' },
  { href: '/concessions/rates', label: 'Fee-fixing' },
  { href: '/concessions/targets', label: 'Targets' },
  { href: '/concessions/approvals', label: 'Approvals' },
  { href: '/concessions/audit', label: 'Audit' },
  { href: '/concessions/zones', label: 'Zones' },
];

export function ConcessionsNav() {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const query = searchParams.toString();

  return (
    <nav className="concessions-tabs" aria-label="Concession management sections">
      {tabs.map((tab) => {
        const active = tab.href === '/concessions'
          ? pathname === '/concessions'
          : pathname.startsWith(tab.href);
        return (
          <Link key={tab.href} href={query ? `${tab.href}?${query}` : tab.href} className={active ? 'active' : ''} aria-current={active ? 'page' : undefined}>
            {tab.label}
          </Link>
        );
      })}
    </nav>
  );
}
