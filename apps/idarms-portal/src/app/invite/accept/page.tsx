import Link from 'next/link';
import { AuthCard } from '@/components/auth/auth-card';
import { NewPasswordForm } from '@/components/auth/auth-forms';
import { MESSAGES } from '@/lib/zitadel-login/form-state';
import { isZitadelId } from '@/lib/zitadel-login/request';
import { passwordRulesText } from '@/lib/zitadel-login/rules-text';
import { acceptInviteAction } from './actions';

type SearchParams = Promise<Record<string, string | string[] | undefined>>;

export default async function AcceptInvitePage({ searchParams }: { searchParams: SearchParams }) {
  const { userId, code, orgId } = await searchParams;
  const valid = isZitadelId(userId) && typeof code === 'string' && code.length > 0;
  const org = isZitadelId(orgId) ? orgId : undefined;

  return (
    <AuthCard
      title="Set up your account"
      intro={valid ? 'You’ve been invited to iDARMS. Choose a password to finish setting up your account.' : undefined}
      footer={<Link href="/login" className="auth-link">Already set up? Sign in</Link>}
    >
      {valid ? (
        <NewPasswordForm
          action={acceptInviteAction}
          hidden={{ userId, code, ...(org ? { orgId: org } : {}) }}
          rules={await passwordRulesText(org)}
          submitLabel="Create my password"
        />
      ) : (
        <p className="auth-alert auth-alert-error" role="alert">{MESSAGES.invalidInviteLink}</p>
      )}
    </AuthCard>
  );
}
