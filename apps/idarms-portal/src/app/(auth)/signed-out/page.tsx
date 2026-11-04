import Link from 'next/link';
import { AuthCard } from '@/components/auth/auth-card';

export const metadata = { title: 'Signed out' };

export default function SignedOutPage() {
  return (
    <AuthCard title="You’re signed out" intro="Your portal session has ended. Sign in again whenever you’re ready.">
      <Link href="/login" className="button auth-submit">Sign in to iDARMS</Link>
    </AuthCard>
  );
}
