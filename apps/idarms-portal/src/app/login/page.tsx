import { auth, signIn, signOut } from '@/auth';

export default async function LoginPage() {
  const session = await auth();

  return (
    <section style={{ maxWidth: 420, margin: '4rem auto', textAlign: 'center' }}>
      <h1>iDARMS Portal</h1>
      {session?.user ? (
        <form
          action={async () => {
            'use server';
            await signOut({ redirectTo: '/login' });
          }}
        >
          <p>
            Signed in as <strong>{session.user.email ?? session.user.name}</strong>
          </p>
          <button className="button" type="submit">Sign out</button>
        </form>
      ) : (
        <form
          action={async () => {
            'use server';
            await signIn('zitadel', { redirectTo: '/' });
          }}
        >
          <button className="button" type="submit">Sign in with ZITADEL</button>
        </form>
      )}
    </section>
  );
}
