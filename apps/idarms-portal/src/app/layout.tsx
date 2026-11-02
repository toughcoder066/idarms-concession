import type { Metadata } from 'next';
import { auth } from '@/auth';
import { PortalShell } from '@/components/portal-shell';
import { getConcessionAccess } from '@/lib/access';
import './globals.css';

export const metadata: Metadata = {
  title: 'iDARMS Portal',
  description: 'Concessionaire admin & field agent UI',
};

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  const session = await auth();
  const access = await getConcessionAccess();

  return (
    <html lang="en">
      <body>
        <PortalShell user={session?.user ?? null} access={access}>{children}</PortalShell>
      </body>
    </html>
  );
}
