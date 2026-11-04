import Link from 'next/link';
import { ArrowLeft, Eye, ShieldAlert } from 'lucide-react';
import { PreviewPersonaLauncher } from '@/components/preview/preview-persona-launcher';
import { getConcessionAccess } from '@/lib/access';

export default async function PreviewUtilityPage() {
  const access = await getConcessionAccess();
  const allowed = access.roles.includes('CONCESSION_SUPER_ADMIN')
    || access.roles.includes('PLATFORM_ADMIN');

  if (!allowed) {
    return (
      <section className="concession-page staff-page">
        <div className="staff-access-panel">
          <span className="staff-access-icon"><ShieldAlert size={24} aria-hidden="true" /></span>
          <h1>Preview experience is not available</h1>
          <p>This utility is limited to Concession Super Admins and Platform Admins.</p>
          <Link href="/dashboard" className="button button-secondary" prefetch={false}>
            <ArrowLeft size={14} aria-hidden="true" /> Back to dashboard
          </Link>
        </div>
      </section>
    );
  }

  return (
    <section className="concession-page staff-page preview-page">
      <div className="concession-page-heading">
        <div>
          <p className="eyebrow">Platform utility</p>
          <h1>Preview experience</h1>
          <p>Choose a generic role to preview its simulated assembly workspace. No real user, data, token, or backend authorization is involved.</p>
        </div>
        <span className="preview-simulation-badge"><Eye size={13} aria-hidden="true" /> SIMULATION ONLY</span>
      </div>
      <PreviewPersonaLauncher />
      <div className="preview-footer">
        <span><Eye size={13} aria-hidden="true" /> Preview mode is read-only and uses static fixtures.</span>
        <Link href="/concession/access-directory" className="button button-secondary button-compact" prefetch={false}>
          <ArrowLeft size={14} aria-hidden="true" /> Back to Access Directory
        </Link>
      </div>
    </section>
  );
}
