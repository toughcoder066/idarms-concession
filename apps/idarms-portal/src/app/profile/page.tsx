import { ArrowRight, UserRound } from 'lucide-react';
import Link from 'next/link';
import { auth } from '@/auth';

export default async function ProfilePage() {
  const session = await auth();
  const user = session?.user;
  const name = user?.name || 'Portal user';

  return (
    <section className="entity-page">
      <div className="entity-breadcrumb"><Link href="/dashboard">Dashboard</Link><span>/</span><span>Profile</span></div>
      <div className="entity-hero module-hero">
        <div className="entity-hero-copy"><span className="entity-kicker"><span className="module-kicker-icon"><UserRound size={14} aria-hidden="true" /></span>ACCOUNT</span><h1>Your profile</h1><p>Account details for your iDARMS workspace.</p></div>
      </div>
      <section className="profile-card">
        <span className="profile-avatar"><UserRound size={25} aria-hidden="true" /></span>
        <div className="profile-details"><h2>{name}</h2><p>{user?.email ?? 'No email address is available for this session.'}</p><span className={`status-badge ${user ? 'positive' : 'neutral'}`}><i />{user ? 'Signed in' : 'Guest session'}</span></div>
        <Link href="/settings" className="button button-secondary">Workspace settings</Link>
      </section>
      {!user && <div className="context-strip profile-signin-note"><span>Sign in to view your account details.</span><Link href="/login" className="dashboard-text-link">Sign in <ArrowRight size={14} aria-hidden="true" /></Link></div>}
    </section>
  );
}
