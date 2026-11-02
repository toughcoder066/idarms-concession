import { redirect } from 'next/navigation';
import { auth, signIn } from '@/auth';

export async function GET() {
  const session = await auth();
  if (session?.user) redirect('/dashboard');

  const authorizationUrl = await signIn('zitadel', {
    redirect: false,
    redirectTo: '/dashboard',
  });
  if (typeof authorizationUrl !== 'string') {
    throw new Error('ZITADEL sign-in did not return an authorization URL.');
  }

  redirect(authorizationUrl);
}
