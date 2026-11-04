import type { Metadata } from 'next';
import { DM_Sans, Manrope } from 'next/font/google';
import './globals.css';

const bodyFont = DM_Sans({ subsets: ['latin'], variable: '--font-body', display: 'swap' });
const displayFont = Manrope({ subsets: ['latin'], variable: '--font-display', display: 'swap' });

export const metadata: Metadata = {
  title: { default: 'iDARMS', template: '%s · iDARMS' },
  description: 'Concessionaire workspace for revenue collection',
};

/**
 * Document shell only. The signed-in workspace chrome lives in the (portal)
 * layout and the sign-in screens in (auth), so a page never renders inside a
 * shell built for a different session state.
 */
export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={`${bodyFont.variable} ${displayFont.variable}`}>
      <body>{children}</body>
    </html>
  );
}
