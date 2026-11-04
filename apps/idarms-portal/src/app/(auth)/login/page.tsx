import { redirect } from 'next/navigation';
import { auth } from '@/auth';
import { AuthCard } from '@/components/auth/auth-card';
import { LoginForm } from '@/components/auth/auth-forms';
import { portalUrl, safeRedirectPath } from '@/lib/zitadel-login/request';
import { loginAction } from './actions';

const NOTICES: Record<string, string> = {
  reset: 'Your password was reset. Sign in with your new password.',
  invited: 'Your account is ready. Sign in with the password you just set.',
  changed: 'Your password was changed. Sign in again with your new password.',
  expired: 'That sign-in took too long. Please sign in again.',
  session_ended: 'Your session has ended. Please sign in again.',
  no_access: 'Your account has no access to iDARMS yet. Ask your administrator to assign you a role.',
};

type SearchParams = Promise<Record<string, string | string[] | undefined>>;

export default async function LoginPage({ searchParams }: { searchParams: SearchParams }) {
  const session = await auth();
  if (session?.user && !session.error) redirect('/dashboard');

  const params = await searchParams;
  const noticeKey = Object.keys(NOTICES).find((key) => params[key] !== undefined);
  // Auth.js lands here with ?error= when its callback could not complete the sign-in.
  const notice = params.error ? 'Sign-in could not be completed. Please try again.' : noticeKey ? NOTICES[noticeKey] : undefined;
  const callbackUrl = typeof params.callbackUrl === 'string' ? params.callbackUrl : undefined;

  return (
    <AuthCard title="Sign in" intro="Use your iDARMS staff account." notice={notice}>
      <LoginForm action={loginAction} redirectTo={safeRedirectPath(callbackUrl, portalUrl())} />
    </AuthCard>
  );
}
