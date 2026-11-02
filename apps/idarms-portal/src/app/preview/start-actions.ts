'use server';

import { redirect } from 'next/navigation';
import { isPreviewPersona } from '@idarms/contracts';
import { appConfig } from '@/lib/config';
import { readPreviewSession, setPreviewCookie } from '@/lib/preview-session';

export interface PreviewActionResult {
  ok: false;
  message: string;
}

export async function startPreviewAction(persona: string): Promise<PreviewActionResult> {
  if (!isPreviewPersona(persona)) {
    return { ok: false, message: 'Choose a valid preview persona.' };
  }

  const session = await readPreviewSession();
  if (!session) {
    return { ok: false, message: 'Your signed-in session could not be read. Sign in again and retry.' };
  }
  if (!session.roles.includes('CONCESSION_SUPER_ADMIN') && !session.roles.includes('PLATFORM_ADMIN')) {
    return {
      ok: false,
      message: 'Preview mode is limited to Concession Super Admins and Platform Admins.',
    };
  }
  if (!session.accessToken) {
    return { ok: false, message: 'Your signed-in session is not available.' };
  }

  const base = appConfig.serviceBaseUrls.concessions.replace(/\/+$/, '');
  try {
    const response = await fetch(`${base}/preview/audit`, {
      method: 'POST',
      headers: {
        accept: 'application/json',
        'content-type': 'application/json',
        authorization: `Bearer ${session.accessToken}`,
      },
      body: JSON.stringify({ persona }),
      cache: 'no-store',
    });
    if (!response.ok) {
      const payload = await response.json().catch(() => null) as { message?: string; error?: string } | null;
      return {
        ok: false,
        message: payload?.message ?? payload?.error ?? 'The preview audit could not be recorded.',
      };
    }
  } catch {
    return {
      ok: false,
      message: 'The preview audit could not be recorded. Check that the local concessions service is running.',
    };
  }

  try {
    await setPreviewCookie(persona, session.actorId);
  } catch {
    return {
      ok: false,
      message: 'Preview mode could not be bound to your current session. Sign in again and retry.',
    };
  }
  redirect(`/preview/${persona}`);
}
