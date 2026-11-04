import Link from 'next/link';
import { AuthCard } from '@/components/auth/auth-card';
import { ForgotPasswordForm } from '@/components/auth/auth-forms';
import { forgotPasswordAction } from './actions';

export default function ForgotPasswordPage() {
  return (
    <AuthCard
      title="Reset your password"
      intro="Enter your username or email address and we’ll email you a link to choose a new password."
      footer={<Link href="/login" className="auth-link">Back to sign in</Link>}
    >
      <ForgotPasswordForm action={forgotPasswordAction} />
    </AuthCard>
  );
}
