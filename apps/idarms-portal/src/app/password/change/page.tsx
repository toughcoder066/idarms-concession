import Link from 'next/link';
import { redirect } from 'next/navigation';
import { AuthCard } from '@/components/auth/auth-card';
import { NewPasswordForm } from '@/components/auth/auth-forms';
import { readPendingLogin } from '@/lib/zitadel-login/cookies';
import { passwordRulesText } from '@/lib/zitadel-login/rules-text';
import { changeRequiredPasswordAction } from './actions';

export default async function ChangeRequiredPasswordPage() {
  const pending = await readPendingLogin();
  if (!pending) redirect('/login?expired=1');

  return (
    <AuthCard
      title="Change your password"
      intro="Your administrator requires a new password before you continue."
      footer={<Link href="/login" className="auth-link">Cancel and sign in again</Link>}
    >
      <NewPasswordForm
        action={changeRequiredPasswordAction}
        rules={await passwordRulesText(pending.orgId)}
        submitLabel="Change password and continue"
      />
    </AuthCard>
  );
}
