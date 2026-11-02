import Link from 'next/link';
import { notFound } from 'next/navigation';
import { Eye, LockKeyhole } from 'lucide-react';
import { isPreviewPersona } from '@idarms/contracts';
import { PreviewWorkspace } from '@/components/preview/preview-workspace';
import { readPreviewPersona } from '@/lib/preview-session';

export default async function PreviewPersonaPage({
  params,
}: {
  params: Promise<{ persona: string }>;
}) {
  const [{ persona }, allowedPersona] = await Promise.all([
    params,
    readPreviewPersona(),
  ]);

  if (!isPreviewPersona(persona)) notFound();

  if (!allowedPersona || allowedPersona !== persona) {
    return (
      <section className="concession-page staff-page">
        <div className="staff-access-panel">
          <span className="staff-access-icon"><LockKeyhole size={24} aria-hidden="true" /></span>
          <h1>Preview session not found</h1>
          <p>Preview mode must be entered from the Access Directory or the preview utility. It does not use or change your current session.</p>
          <Link href="/portfolio/access-directory" className="button button-secondary" prefetch={false}>
            <Eye size={14} aria-hidden="true" /> Return to Access Directory
          </Link>
        </div>
      </section>
    );
  }

  return <PreviewWorkspace persona={persona} />;
}
