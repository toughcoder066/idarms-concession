'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';

const navigation = [
  {
    title: 'Overview',
    items: [
      { href: '/dashboard', label: 'Operational dashboard', icon: 'dashboard' },
    ],
  },
  {
    title: 'Operations',
    items: [
      { href: '/properties', label: 'Properties', icon: 'property' },
      { href: '/ratepayers', label: 'Ratepayers', icon: 'people' },
    ],
  },
  {
    title: 'Financial',
    items: [
      { href: '/billing', label: 'Billing', icon: 'bill' },
      { href: '/payments', label: 'Payments', icon: 'payment' },
    ],
  },
];

const iconPaths: Record<string, React.ReactNode> = {
  dashboard: <><rect x="3" y="3" width="7" height="7" rx="1.5" /><rect x="14" y="3" width="7" height="7" rx="1.5" /><rect x="3" y="14" width="7" height="7" rx="1.5" /><rect x="14" y="14" width="7" height="7" rx="1.5" /></>,
  property: <><path d="m3 10 9-7 9 7" /><path d="M5 9v11h14V9M9 20v-6h6v6" /></>,
  people: <><circle cx="9" cy="8" r="3.5" /><path d="M2.8 20a6.2 6.2 0 0 1 12.4 0M16 5.2a3.5 3.5 0 0 1 0 6.7M17.5 14a5.5 5.5 0 0 1 3.7 5.2" /></>,
  bill: <><path d="M6 3h12a2 2 0 0 1 2 2v16l-3-1.8L14 21l-3-1.8L8 21l-4-2V5a2 2 0 0 1 2-2Z" /><path d="M8 8h8M8 12h8M8 16h4" /></>,
  payment: <><rect x="2.5" y="5" width="19" height="14" rx="2.5" /><path d="M3 9h18M7 15h4" /></>,
};

function NavIcon({ name }: { name: string }) {
  return (
    <svg className="nav-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      {iconPaths[name]}
    </svg>
  );
}

export function PortalShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();

  return (
    <div className="portal">
      <aside className="sidebar">
        <Link href="/dashboard" className="brand" aria-label="iDARMS dashboard">
          <span className="brand-mark">i</span>
          <span>
            <span className="brand-name">iDARMS</span>
            <span className="brand-caption" style={{ display: 'block' }}>Concessionaire workspace</span>
          </span>
        </Link>

        <nav aria-label="Main navigation">
          {navigation.map((group) => (
            <div className="nav-group" key={group.title}>
              <div className="nav-heading">{group.title}</div>
              <div className="nav-list">
                {group.items.map((item) => {
                  const active = pathname === item.href || (item.href !== '/dashboard' && pathname.startsWith(`${item.href}/`));
                  return (
                    <Link key={item.href} href={item.href} className={`nav-link${active ? ' active' : ''}`} aria-current={active ? 'page' : undefined}>
                      <NavIcon name={item.icon} />
                      {item.label}
                    </Link>
                  );
                })}
              </div>
            </div>
          ))}
        </nav>

        <div className="sidebar-bottom">
          <div className="workspace-card">
            <div className="workspace-label">Current workspace</div>
            <div className="workspace-name">Local operations</div>
            <div className="workspace-status"><span className="status-dot" /> iDARMS service data</div>
          </div>
        </div>
      </aside>

      <div className="main-column">
        <header className="topbar">
          <div className="topbar-context"><strong>iDARMS</strong> &nbsp; / &nbsp; Concessionaire portal</div>
          <div className="topbar-right">
            <span className="topbar-date">{new Intl.DateTimeFormat('en-GH', { dateStyle: 'medium' }).format(new Date())}</span>
            <span className="scope-pill"><span className="status-dot" /> Local workspace</span>
          </div>
        </header>
        <main className="container">{children}</main>
      </div>
    </div>
  );
}
