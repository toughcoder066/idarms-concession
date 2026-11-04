import { redirect } from 'next/navigation';
import { auth } from '@/auth';
import { PortalShell } from '@/components/portal-shell';
import { getConcessionAccess } from '@/lib/access';
import { sessionEndPath } from '@/lib/session-token';

/**
 * The signed-in workspace. The middleware already refuses anonymous requests;
 * this check makes the shell itself impossible to render without a user, and
 * signs out a session that has ended or holds no iDARMS role.
 */
export default async function PortalLayout({ children }: { children: React.ReactNode }) {
  const session = await auth();
  if (!session?.user) redirect('/login');
  if (session.error) redirect(sessionEndPath(session.error));
  if (session.roles.length === 0) redirect(sessionEndPath('NoRoles'));
  const access = await getConcessionAccess();

  return (
    <PortalShell
      user={{ name: session.user.name, email: session.user.email, image: session.user.image }}
      access={access}
    >
      {children}
    </PortalShell>
  );
}
