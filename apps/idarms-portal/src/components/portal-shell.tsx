'use client';

import {
  Activity,
  ArrowDownLeft,
  BarChart3,
  Building2,
  ChevronDown,
  CreditCard,
  FileSignature,
  FileText,
  Eye,
  History,
  Inbox,
  Landmark,
  LayoutDashboard,
  LogIn,
  LogOut,
  Map,
  ReceiptText,
  ScrollText,
  Settings,
  ShieldCheck,
  Target,
  UsersRound,
} from 'lucide-react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useEffect, useRef, useState } from 'react';
import { signOutAction } from '@/app/actions';
import type { ConcessionAccess } from '@/lib/access';

const navigation = [
  {
    title: 'Overview',
    items: [{ href: '/dashboard', label: 'Dashboard', icon: LayoutDashboard }],
  },
  {
    title: 'Concession management',
    items: [
      { href: '/concessions', label: 'Portfolio overview', icon: Landmark },
      { href: '/concessions/assemblies', label: 'Assemblies', icon: Building2 },
      { href: '/concessions/contracts', label: 'Contracts & splits', icon: FileSignature },
      { href: '/concessions/rates', label: 'Fee-fixing', icon: ReceiptText },
      { href: '/concessions/targets', label: 'Targets & performance', icon: Target },
      { href: '/concessions/approvals', label: 'Approvals inbox', icon: Inbox },
      { href: '/concessions/audit', label: 'Configuration audit', icon: ScrollText },
      { href: '/concessions/zones', label: 'Zones & agents', icon: Map },
    ],
  },
  {
    title: 'Operations',
    items: [
      { href: '/properties', label: 'Properties', icon: Building2 },
      { href: '/ratepayers', label: 'Ratepayers', icon: UsersRound },
      { href: '/gis', label: 'GIS & mapping', icon: Map },
    ],
  },
  {
    title: 'Finance',
    items: [
      { href: '/billing', label: 'Billing', icon: FileText },
      { href: '/payments', label: 'Payments', icon: CreditCard },
      { href: '/reconciliation', label: 'Reconciliation', icon: ArrowDownLeft },
    ],
  },
  {
    title: 'Records & services',
    items: [
      { href: '/documents', label: 'Documents', icon: FileText },
      { href: '/valuations', label: 'Valuations', icon: BarChart3 },
      { href: '/sync', label: 'CROIP sync', icon: Activity },
      { href: '/reporting', label: 'Reporting', icon: BarChart3 },
    ],
  },
];

interface PortalUser {
  name?: string | null;
  email?: string | null;
  image?: string | null;
}

export function PortalShell({
  children,
  user,
  access,
}: {
  children: React.ReactNode;
  user: PortalUser | null;
  access: ConcessionAccess;
}) {
  const pathname = usePathname();
  const [menuOpen, setMenuOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    setMenuOpen(false);
  }, [pathname]);

  useEffect(() => {
    if (!menuOpen) return;
    function onPointerDown(event: PointerEvent) {
      if (menuRef.current && !menuRef.current.contains(event.target as Node)) {
        setMenuOpen(false);
      }
    }
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === 'Escape') setMenuOpen(false);
    }
    document.addEventListener('pointerdown', onPointerDown);
    document.addEventListener('keydown', onKeyDown);
    return () => {
      document.removeEventListener('pointerdown', onPointerDown);
      document.removeEventListener('keydown', onKeyDown);
    };
  }, [menuOpen]);

  const emailLocal = user?.email?.split('@')[0];
  const displayName = user?.name?.trim()
    || (emailLocal ? emailLocal.replace(/[._-]+/g, ' ').replace(/\b\w/g, (character) => character.toUpperCase()) : 'Portal user');
  const initials = displayName.split(/\s+/).slice(0, 2).map((part) => part[0]).join('').toUpperCase();
  const concessionVisible = access.canViewConcessions;
  const baseGroups = navigation.filter((group) => group.title !== 'Concession management' || concessionVisible);
  const personaGroups: typeof navigation = [];
  if (access.roles.includes('ASSEMBLY_ADMIN') && access.assemblyId) {
    personaGroups.push({
      title: 'Assembly administration',
      items: [
        {
          href: `/assembly/${access.assemblyId}/staff-access`,
          label: 'Staff & access',
          icon: UsersRound,
        },
        {
          href: `/assembly/${access.assemblyId}/activity-audit`,
          label: 'Activity & audit',
          icon: History,
        },
      ],
    });
  }
  if (access.roles.includes('CONCESSION_SUPER_ADMIN')) {
    personaGroups.push({
      title: 'Concession portfolio',
      items: [
        {
          href: '/portfolio/access-directory',
          label: 'Access directory',
          icon: ShieldCheck,
        },
        {
          href: '/portfolio/audit-ledger',
          label: 'Audit ledger',
          icon: ScrollText,
        },
      ],
    });
  }
  if (access.roles.includes('PLATFORM_ADMIN')) {
    personaGroups.push({
      title: 'Platform tools',
      items: [{
        href: '/preview',
        label: 'Preview experience',
        icon: Eye,
      }],
    });
  }
  const navigationGroups = [
    ...(baseGroups[0] ? [baseGroups[0]] : []),
    ...personaGroups,
    ...baseGroups.slice(1),
  ];

  if (pathname === '/login') {
    return <>{children}</>;
  }

  return (
    <div className="portal">
      <aside className="sidebar">
        <Link href="/dashboard" prefetch={false} className="brand" aria-label="iDARMS dashboard">
          <span className="brand-mark"><LayoutDashboard size={20} strokeWidth={2.2} aria-hidden="true" /></span>
          <span>
            <span className="brand-name">iDARMS</span>
            <span className="brand-caption">Concessionaire workspace</span>
          </span>
        </Link>

        <nav className="side-navigation" aria-label="Main navigation">
          {navigationGroups.map((group) => (
            <div className="nav-group" key={group.title}>
              <div className="nav-heading">{group.title}</div>
              <div className="nav-list">
                {group.items.map(({ href, label, icon: Icon }) => {
                  const active = pathname === href || (href !== '/dashboard' && pathname.startsWith(`${href}/`));
                  return (
                    <Link key={`${href}-${label}`} href={href} prefetch={false} className={`nav-link${active ? ' active' : ''}`} aria-current={active ? 'page' : undefined}>
                      <Icon className="nav-icon" size={17} strokeWidth={1.8} aria-hidden="true" />
                      <span>{label}</span>
                    </Link>
                  );
                })}
              </div>
            </div>
          ))}
        </nav>

        <div className="sidebar-bottom">
          <Link href="/settings" prefetch={false} className={`nav-link settings-link${pathname === '/settings' ? ' active' : ''}`} aria-current={pathname === '/settings' ? 'page' : undefined}>
            <Settings className="nav-icon" size={17} strokeWidth={1.8} aria-hidden="true" />
            <span>Settings</span>
          </Link>
          <div className="workspace-card">
            <div className="workspace-label">Current workspace</div>
            <div className="workspace-name">Local operations</div>
            <div className="workspace-status"><span className="status-dot" /> iDARMS service data</div>
          </div>
        </div>
      </aside>

      <div className="main-column">
        <header className="topbar">
          <div className="topbar-context"><strong>iDARMS</strong><span>/</span><span>Concessionaire portal</span></div>
          <div className="topbar-right">
            <span className="topbar-date">{new Intl.DateTimeFormat('en-GH', { dateStyle: 'medium' }).format(new Date())}</span>
            <span className="scope-pill"><span className="status-dot" /> {access.roleLabel}</span>
            <div className={`account-menu${menuOpen ? ' open' : ''}`} ref={menuRef}>
              <button type="button" className="account-trigger" aria-haspopup="menu" aria-expanded={menuOpen} aria-label="Open account menu" onClick={() => setMenuOpen((open) => !open)}>
                {user?.image ? <img className="account-avatar" src={user.image} alt="" /> : <span className="account-avatar account-initials">{user ? initials : <UsersRound size={17} aria-hidden="true" />}</span>}
                <span className="account-copy"><strong>{user ? displayName : 'Welcome'}</strong><small>{user?.email ?? (user ? 'Signed in' : 'Guest session')}</small></span>
                <ChevronDown size={15} aria-hidden="true" className={menuOpen ? 'chevron-open' : ''} />
              </button>
              {menuOpen && (
                <div className="account-dropdown" role="menu" aria-label="Account">
                  {user ? (
                    <>
                      <div className="account-dropdown-heading"><strong>{displayName}</strong><small>{user.email ?? 'iDARMS account'}</small>{access.roleLabel && <em>{access.roleLabel}</em>}</div>
                      <Link href="/profile" prefetch={false} className="account-menu-item" role="menuitem" onClick={() => setMenuOpen(false)}><UsersRound size={16} aria-hidden="true" /> Profile</Link>
                      <Link href="/settings" prefetch={false} className="account-menu-item" role="menuitem" onClick={() => setMenuOpen(false)}><Settings size={16} aria-hidden="true" /> Settings</Link>
                      <form action={signOutAction}>
                        <button className="account-menu-item account-logout" type="submit" role="menuitem"><LogOut size={16} aria-hidden="true" /> Sign out</button>
                      </form>
                    </>
                  ) : (
                    <>
                      <div className="account-dropdown-heading"><strong>Welcome to iDARMS</strong><small>Sign in to access your workspace.</small></div>
                      <Link href="/login" prefetch={false} className="account-menu-item" role="menuitem" onClick={() => setMenuOpen(false)}><LogIn size={16} aria-hidden="true" /> Sign in</Link>
                    </>
                  )}
                </div>
              )}
            </div>
          </div>
        </header>
        <main className="container">{children}</main>
      </div>
    </div>
  );
}
