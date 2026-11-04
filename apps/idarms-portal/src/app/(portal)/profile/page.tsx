import { UserRound } from 'lucide-react';
import Link from 'next/link';
import { auth } from '@/auth';
import { getConcessionAccess } from '@/lib/access';

export const metadata = { title: 'Profile' };

export default async function ProfilePage() {
  // The (portal) layout guarantees a signed-in user.
  const [session, access] = await Promise.all([auth(), getConcessionAccess()]);
  const user = session?.user;
  const name = user?.name || user?.email || 'iDARMS user';

  return (
    <section className="entity-page">
      <div className="entity-hero module-hero">
        <div className="entity-hero-copy"><span className="entity-kicker"><span className="module-kicker-icon"><UserRound size={14} aria-hidden="true" /></span>ACCOUNT</span><h1>Your profile</h1><p>Account details for your iDARMS workspace.</p></div>
      </div>
      <section className="profile-card">
        <span className="profile-avatar"><UserRound size={25} aria-hidden="true" /></span>
        <div className="profile-details">
          <h2>{name}</h2>
          {user?.email && <p>{user.email}</p>}
          <span className="status-badge positive"><i />{access.roleLabel}</span>
        </div>
        <Link href="/settings" className="button button-secondary">Workspace settings</Link>
      </section>
    </section>
  );
}
