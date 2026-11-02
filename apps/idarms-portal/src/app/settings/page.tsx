import { ArrowRight, Building2, CircleHelp, Settings, ShieldCheck } from 'lucide-react';
import Link from 'next/link';
import { auth } from '@/auth';

export default async function SettingsPage() {
  const session = await auth();

  return (
    <section className="entity-page">
      <div className="entity-breadcrumb"><Link href="/dashboard">Dashboard</Link><span>/</span><span>Settings</span></div>
      <div className="entity-hero module-hero">
        <div className="entity-hero-copy"><span className="entity-kicker"><span className="module-kicker-icon"><Settings size={14} aria-hidden="true" /></span>WORKSPACE ADMINISTRATION</span><h1>Settings</h1><p>Review workspace access and the services available to this portal.</p></div>
      </div>
      <div className="settings-grid">
        <article className="settings-card"><span className="settings-card-icon"><Building2 size={18} aria-hidden="true" /></span><div><span className="dashboard-section-label">WORKSPACE</span><h2>Local operations</h2><p>This portal is connected to the configured iDARMS service environment. Data and permissions are scoped by your account.</p></div><Link href="/dashboard" className="dashboard-text-link">View overview <ArrowRight size={14} aria-hidden="true" /></Link></article>
        <article className="settings-card"><span className="settings-card-icon"><ShieldCheck size={18} aria-hidden="true" /></span><div><span className="dashboard-section-label">ACCOUNT ACCESS</span><h2>{session?.user?.email ?? 'Guest session'}</h2><p>{session?.user ? 'Authentication is managed through your organization identity provider.' : 'Sign in with your organization account to access protected workspace records.'}</p></div><Link href={session?.user ? '/profile' : '/login'} className="dashboard-text-link">{session?.user ? 'View profile' : 'Sign in'} <ArrowRight size={14} aria-hidden="true" /></Link></article>
        <article className="settings-card"><span className="settings-card-icon"><CircleHelp size={18} aria-hidden="true" /></span><div><span className="dashboard-section-label">SERVICE CONFIGURATION</span><h2>Managed by your administrator</h2><p>API endpoints, access scopes, and service credentials are managed in the deployment environment and are not editable from this screen.</p></div><Link href="/sync" className="dashboard-text-link">View CROIP sync <ArrowRight size={14} aria-hidden="true" /></Link></article>
      </div>
    </section>
  );
}
