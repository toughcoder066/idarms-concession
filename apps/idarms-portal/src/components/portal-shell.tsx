'use client';

import {
  Activity,
  BarChart3,
  Building2,
  Calculator,
  ChevronDown,
  CreditCard,
  Eye,
  FileSignature,
  FolderOpen,
  GitCompareArrows,
  Globe,
  History,
  House,
  Inbox,
  Landmark,
  LayoutDashboard,
  LogOut,
  MapPinned,
  Percent,
  ReceiptText,
  ScrollText,
  Settings,
  ShieldCheck,
  Target,
  UserRound,
  UsersRound,
  type LucideIcon,
} from 'lucide-react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useEffect, useRef, useState } from 'react';
import { signOutAction } from '@/app/actions';
import { BrandMark } from '@/components/brand-mark';
import type { ConcessionAccess } from '@/lib/access';

interface NavItem {
  href: string;
  label: string;
  icon: LucideIcon;
}

interface NavGroup {
  title: string;
  items: NavItem[];
}

const navigation: NavGroup[] = [
  {
    title: 'Overview',
    items: [{ href: '/dashboard', label: 'Dashboard', icon: LayoutDashboard }],
  },
  {
    title: 'Concession management',
    items: [
      { href: '/concessions', label: 'Concession overview', icon: Landmark },
      { href: '/concessions/assemblies', label: 'Assemblies', icon: Building2 },
      { href: '/concessions/contracts', label: 'Contracts & splits', icon: FileSignature },
      { href: '/concessions/rates', label: 'Fee-fixing', icon: Percent },
      { href: '/concessions/targets', label: 'Targets & performance', icon: Target },
      { href: '/concessions/approvals', label: 'Approvals inbox', icon: Inbox },
      { href: '/concessions/audit', label: 'Configuration audit', icon: ScrollText },
      { href: '/concessions/zones', label: 'Zones & agents', icon: MapPinned },
    ],
  },
  {
    title: 'Operations',
    items: [
      { href: '/properties', label: 'Properties', icon: House },
      { href: '/ratepayers', label: 'Ratepayers', icon: UsersRound },
      { href: '/gis', label: 'GIS & mapping', icon: Globe },
    ],
  },
  {
    title: 'Finance',
    items: [
      { href: '/billing', label: 'Billing', icon: ReceiptText },
      { href: '/payments', label: 'Payments', icon: CreditCard },
      { href: '/reconciliation', label: 'Reconciliation', icon: GitCompareArrows },
    ],
  },
  {
    title: 'Records & services',
    items: [
      { href: '/documents', label: 'Documents', icon: FolderOpen },
      { href: '/valuations', label: 'Valuations', icon: Calculator },
      { href: '/sync', label: 'CROIP sync', icon: Activity },
      { href: '/reporting', label: 'Reporting', icon: BarChart3 },
    ],
  },
];

const accountPages: NavItem[] = [
  { href: '/settings', label: 'Settings', icon: Settings },
  { href: '/profile', label: 'Profile', icon: UserRound },
];

interface PortalUser {
  name?: string | null;
  email?: string | null;
  image?: string | null;
}

function displayNameOf(user: PortalUser): string {
  const name = user.name?.trim();
  if (name) return name;
  const local = user.email?.split('@')[0];
  if (local) return local.replace(/[._-]+/g, ' ').replace(/\b\w/g, (character) => character.toUpperCase());
  return 'iDARMS user';
}

function initialsOf(name: string): string {
  return name.split(/\s+/).filter(Boolean).slice(0, 2).map((part) => part[0]).join('').toUpperCase();
}

function isActive(pathname: string, href: string): boolean {
  return pathname === href || (href !== '/dashboard' && pathname.startsWith(`${href}/`));
}

/** The longest nav entry that contains the current path names the page in the top bar. */
function currentPage(pathname: string, groups: NavGroup[]): { group?: string; label: string } | null {
  let best: { group?: string; label: string; length: number } | null = null;
  for (const group of groups) {
    for (const item of group.items) {
      if (isActive(pathname, item.href) && (!best || item.href.length > best.length)) {
        best = { group: group.title, label: item.label, length: item.href.length };
      }
    }
  }
  for (const item of accountPages) {
    if (isActive(pathname, item.href)) best = { label: item.label, length: item.href.length };
  }
  return best;
}

export function PortalShell({
  children,
  user,
  access,
}: {
  children: React.ReactNode;
  user: PortalUser;
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

  const displayName = displayNameOf(user);
  const initials = initialsOf(displayName);
  const baseGroups = navigation.filter((group) => group.title !== 'Concession management' || access.canViewConcessions);
  const personaGroups: NavGroup[] = [];
  if (access.roles.includes('ASSEMBLY_ADMIN') && access.assemblyId) {
    personaGroups.push({
      title: 'Assembly administration',
      items: [
        { href: `/assembly/${access.assemblyId}/staff-access`, label: 'Staff & access', icon: UsersRound },
        { href: `/assembly/${access.assemblyId}/activity-audit`, label: 'Activity & audit', icon: History },
      ],
    });
  }
  if (access.roles.includes('CONCESSION_SUPER_ADMIN')) {
    personaGroups.push({
      title: 'Concession',
      items: [
        { href: '/concession/access-directory', label: 'Access directory', icon: ShieldCheck },
        { href: '/concession/audit-ledger', label: 'Audit ledger', icon: ScrollText },
      ],
    });
  }
  if (access.roles.includes('PLATFORM_ADMIN')) {
    personaGroups.push({
      title: 'Platform tools',
      items: [{ href: '/preview', label: 'Preview experience', icon: Eye }],
    });
  }
  const navigationGroups = [
    ...(baseGroups[0] ? [baseGroups[0]] : []),
    ...personaGroups,
    ...baseGroups.slice(1),
  ];
  const page = currentPage(pathname, navigationGroups);
  const scopeTitle = access.concessionWide ? 'Concession' : 'Assembly workspace';
  const scopeDetail = access.concessionWide
    ? 'All assigned assemblies'
    : access.assemblyId ? 'Scoped to your assembly' : 'No assembly assigned';

  return (
    <div className="portal">
      <aside className="sidebar">
        <Link href="/dashboard" prefetch={false} className="brand" aria-label="iDARMS dashboard">
          <BrandMark />
        </Link>

        <nav className="side-navigation" aria-label="Main navigation">
          {navigationGroups.map((group) => (
            <div className="nav-group" key={group.title}>
              <div className="nav-heading">{group.title}</div>
              <div className="nav-list">
                {group.items.map(({ href, label, icon: Icon }) => {
                  const active = isActive(pathname, href);
                  return (
                    <Link key={`${href}-${label}`} href={href} prefetch={false} className={`nav-link${active ? ' active' : ''}`} aria-current={active ? 'page' : undefined}>
                      <Icon className="nav-icon" size={18} strokeWidth={1.8} aria-hidden="true" />
                      <span>{label}</span>
                    </Link>
                  );
                })}
              </div>
            </div>
          ))}
        </nav>

        <div className="sidebar-bottom">
          <div className="workspace-card">
            <div className="workspace-label">Workspace</div>
            <div className="workspace-name">{scopeTitle}</div>
            <div className="workspace-status"><span className={`status-dot${access.concessionWide || access.assemblyId ? ' live' : ''}`} /> {scopeDetail}</div>
          </div>
        </div>
      </aside>

      <div className="main-column">
        <header className="topbar">
          <nav className="topbar-context" aria-label="Breadcrumb">
            <Link href="/dashboard" prefetch={false}>iDARMS</Link>
            {page?.group && page.group !== 'Overview' && <><span className="crumb-separator" aria-hidden="true">/</span><span>{page.group}</span></>}
            {page && <><span className="crumb-separator" aria-hidden="true">/</span><strong aria-current="page">{page.label}</strong></>}
          </nav>
          <div className="topbar-right">
            <span className="topbar-date">{new Intl.DateTimeFormat('en-GH', { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' }).format(new Date())}</span>
            <div className={`account-menu${menuOpen ? ' open' : ''}`} ref={menuRef}>
              <button type="button" className="account-trigger" aria-haspopup="menu" aria-expanded={menuOpen} aria-label={`Account menu for ${displayName}`} onClick={() => setMenuOpen((open) => !open)}>
                {user.image ? <img className="account-avatar" src={user.image} alt="" /> : <span className="account-avatar account-initials" aria-hidden="true">{initials}</span>}
                <span className="account-copy"><strong>{displayName}</strong><small>{access.roleLabel}</small></span>
                <ChevronDown size={16} aria-hidden="true" className={`account-chevron${menuOpen ? ' chevron-open' : ''}`} />
              </button>
              {menuOpen && (
                <div className="account-dropdown" role="menu" aria-label="Account">
                  <div className="account-dropdown-heading">
                    <span className="account-avatar account-initials account-avatar-lg" aria-hidden="true">{initials}</span>
                    <span className="account-dropdown-identity">
                      <strong>{displayName}</strong>
                      {user.email && <small>{user.email}</small>}
                      <em>{access.roleLabel}</em>
                    </span>
                  </div>
                  <div className="account-dropdown-items">
                    {accountPages.slice().reverse().map(({ href, label, icon: Icon }) => (
                      <Link key={href} href={href} prefetch={false} className="account-menu-item" role="menuitem" onClick={() => setMenuOpen(false)}><Icon size={16} aria-hidden="true" /> {label}</Link>
                    ))}
                  </div>
                  <form action={signOutAction} className="account-dropdown-footer">
                    <button className="account-menu-item account-logout" type="submit" role="menuitem"><LogOut size={16} aria-hidden="true" /> Sign out</button>
                  </form>
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
