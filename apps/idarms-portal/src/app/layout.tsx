import type { Metadata } from 'next';
import { PortalShell } from '@/components/portal-shell';
import './globals.css';

export const metadata: Metadata = {
  title: 'iDARMS Portal',
  description: 'Concessionaire admin & field agent UI',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>
        <PortalShell>{children}</PortalShell>
      </body>
    </html>
  );
}
