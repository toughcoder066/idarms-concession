import { ArrowRight, Building2, CircleHelp, Settings, ShieldCheck } from 'lucide-react';
import Link from 'next/link';
import { auth } from '@/auth';
import { getConcessionAccess } from '@/lib/access';

export const metadata = { title: 'Settings' };

export default async function SettingsPage() {
  // The (portal) layout guarantees a signed-in user.
  const [session, access] = await Promise.all([auth(), getConcessionAccess()]);
  const workspace = access.concessionWide ? 'Concession' : 'Assembly workspace';
  const workspaceDetail = access.concessionWide
    ? 'You see every assembly assigned to your concession. Records are read-only at this level.'
    : 'Records and actions are limited to the assembly your account belongs to.';

  return (
    <section className="entity-page">
      <div className="entity-hero module-hero">
        <div className="entity-hero-copy"><span className="entity-kicker"><span className="module-kicker-icon"><Settings size={14} aria-hidden="true" /></span>WORKSPACE ADMINISTRATION</span><h1>Settings</h1><p>Review workspace access and the services available to this portal.</p></div>
      </div>
      <div className="settings-grid">
        <article className="settings-card"><span className="settings-card-icon"><Building2 size={18} aria-hidden="true" /></span><div><span className="dashboard-section-label">WORKSPACE</span><h2>{workspace}</h2><p>{workspaceDetail}</p></div><Link href="/dashboard" className="dashboard-text-link">View overview <ArrowRight size={14} aria-hidden="true" /></Link></article>
        <article className="settings-card"><span className="settings-card-icon"><ShieldCheck size={18} aria-hidden="true" /></span><div><span className="dashboard-section-label">ACCOUNT ACCESS</span><h2>{session?.user?.email ?? session?.user?.name ?? 'Your account'}</h2><p>Signed in as {access.roleLabel}. Your identity and password are managed by your organisation&rsquo;s iDARMS administrator.</p></div><Link href="/profile" className="dashboard-text-link">View profile <ArrowRight size={14} aria-hidden="true" /></Link></article>
        <article className="settings-card"><span className="settings-card-icon"><CircleHelp size={18} aria-hidden="true" /></span><div><span className="dashboard-section-label">SERVICE CONFIGURATION</span><h2>Managed by your administrator</h2><p>API endpoints, access scopes, and service credentials are managed in the deployment environment and are not editable from this screen.</p></div><Link href="/sync" className="dashboard-text-link">View CROIP sync <ArrowRight size={14} aria-hidden="true" /></Link></article>
      </div>
    </section>
  );
}
