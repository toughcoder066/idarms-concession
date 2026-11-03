import Link from 'next/link';
import { AuthCard } from '@/components/auth/auth-card';
import { NewPasswordForm } from '@/components/auth/auth-forms';
import { MESSAGES } from '@/lib/zitadel-login/form-state';
import { isZitadelId } from '@/lib/zitadel-login/request';
import { passwordRulesText } from '@/lib/zitadel-login/rules-text';
import { resetPasswordAction } from './actions';

type SearchParams = Promise<Record<string, string | string[] | undefined>>;

export default async function ResetPasswordPage({ searchParams }: { searchParams: SearchParams }) {
  const { userId, code, orgId } = await searchParams;
  const valid = isZitadelId(userId) && typeof code === 'string' && code.length > 0;
  const org = isZitadelId(orgId) ? orgId : undefined;

  return (
    <AuthCard
      title="Choose a new password"
      intro={valid ? 'Set the new password for your iDARMS account.' : undefined}
      footer={<Link href="/login" className="auth-link">Back to sign in</Link>}
    >
      {valid ? (
        <NewPasswordForm
          action={resetPasswordAction}
          hidden={{ userId, code, ...(org ? { orgId: org } : {}) }}
          rules={await passwordRulesText(org)}
          submitLabel="Save new password"
        />
      ) : (
        <p className="auth-alert auth-alert-error" role="alert">
          {MESSAGES.invalidResetLink} <Link href="/password/forgot" className="auth-link">Request a new link</Link>
        </p>
      )}
    </AuthCard>
  );
}
