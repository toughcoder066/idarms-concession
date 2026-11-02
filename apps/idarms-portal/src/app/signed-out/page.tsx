import Link from 'next/link';
import { CheckCircle2 } from 'lucide-react';

export default function SignedOutPage() {
  return (
    <section className="signed-out-page" aria-labelledby="signed-out-title">
      <div className="signed-out-card">
        <span className="signed-out-icon"><CheckCircle2 size={24} aria-hidden="true" /></span>
        <p className="eyebrow">iDARMS account</p>
        <h1 id="signed-out-title">You’re signed out</h1>
        <p className="muted">Your portal session has ended. Sign in again whenever you’re ready.</p>
        <Link href="/login" className="button">Sign in to iDARMS</Link>
      </div>
    </section>
  );
}
