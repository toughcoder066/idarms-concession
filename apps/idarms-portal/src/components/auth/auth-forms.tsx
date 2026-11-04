'use client';

import Link from 'next/link';
import { useActionState, useEffect } from 'react';
import { useFormStatus } from 'react-dom';
import type { AuthFormState } from '@/lib/zitadel-login/form-state';

type Action = (previous: AuthFormState, formData: FormData) => Promise<AuthFormState>;

/**
 * Finishes a sign-in with a full page load. The target is the Auth.js
 * callback (a route handler that sets the session cookie); a client-side
 * navigation would keep the signed-out page and layout on screen.
 */
function useSignInRedirect(state: AuthFormState) {
  useEffect(() => {
    if (state.redirectTo) window.location.replace(state.redirectTo);
  }, [state.redirectTo]);
  return Boolean(state.redirectTo);
}

function SubmitButton({ label, pendingLabel, busy = false }: { label: string; pendingLabel: string; busy?: boolean }) {
  const { pending: submitting } = useFormStatus();
  const pending = submitting || busy;
  return (
    <button type="submit" className="button auth-submit" disabled={pending} aria-disabled={pending}>
      {pending ? pendingLabel : label}
    </button>
  );
}

function FormError({ state }: { state: AuthFormState }) {
  return state.error ? <p className="auth-alert auth-alert-error" role="alert">{state.error}</p> : null;
}

export function LoginForm({ action, redirectTo }: { action: Action; redirectTo: string }) {
  const [state, formAction] = useActionState(action, {});
  const signingIn = useSignInRedirect(state);
  return (
    <form action={formAction} className="auth-form" noValidate>
      <FormError state={state} />
      <input type="hidden" name="redirectTo" value={redirectTo} />
      <label className="field">
        <span className="field-label">Username or email</span>
        <input name="loginName" type="text" autoComplete="username" autoCapitalize="none" spellCheck={false} required autoFocus />
      </label>
      <label className="field">
        <span className="field-label auth-label-row">
          Password
          <Link href="/password/forgot" className="auth-link">Forgot password?</Link>
        </span>
        <input name="password" type="password" autoComplete="current-password" required />
      </label>
      <SubmitButton label="Sign in" pendingLabel="Signing in…" busy={signingIn} />
    </form>
  );
}

export function ForgotPasswordForm({ action }: { action: Action }) {
  const [state, formAction] = useActionState(action, {});
  if (state.sent) {
    return (
      <p className="auth-alert auth-alert-success" role="status">
        If an account matches, we’ve emailed a link to reset the password. The link expires soon, so use it shortly.
      </p>
    );
  }
  return (
    <form action={formAction} className="auth-form" noValidate>
      <FormError state={state} />
      <label className="field">
        <span className="field-label">Username or email</span>
        <input name="loginName" type="text" autoComplete="username" autoCapitalize="none" spellCheck={false} required autoFocus />
      </label>
      <SubmitButton label="Email me a reset link" pendingLabel="Sending…" />
    </form>
  );
}

export function NewPasswordForm({
  action,
  hidden = {},
  rules,
  submitLabel,
}: {
  action: Action;
  hidden?: Record<string, string>;
  rules: string;
  submitLabel: string;
}) {
  const [state, formAction] = useActionState(action, {});
  const signingIn = useSignInRedirect(state);
  return (
    <form action={formAction} className="auth-form" noValidate>
      <FormError state={state} />
      {Object.entries(hidden).map(([name, value]) => <input key={name} type="hidden" name={name} value={value} />)}
      <label className="field">
        <span className="field-label">New password</span>
        <input name="password" type="password" autoComplete="new-password" required autoFocus aria-describedby="password-rules" />
        <small id="password-rules">{rules}</small>
      </label>
      <label className="field">
        <span className="field-label">Confirm new password</span>
        <input name="confirm" type="password" autoComplete="new-password" required />
      </label>
      <SubmitButton label={submitLabel} pendingLabel={signingIn ? 'Signing in…' : 'Saving…'} busy={signingIn} />
    </form>
  );
}
