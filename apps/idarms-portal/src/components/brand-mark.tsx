import { ShieldCheck } from 'lucide-react';

/** The iDARMS logo lock-up, shared by the workspace sidebar and the sign-in screens. */
export function BrandMark({ caption = 'Concessionaire workspace' }: { caption?: string }) {
  return (
    <>
      <span className="brand-mark"><ShieldCheck size={20} strokeWidth={2.2} aria-hidden="true" /></span>
      <span className="brand-text">
        <span className="brand-name">iDARMS</span>
        <span className="brand-caption">{caption}</span>
      </span>
    </>
  );
}
