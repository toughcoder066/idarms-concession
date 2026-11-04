'use server';

import { redirect } from 'next/navigation';
import { clearPreviewCookie } from '@/lib/preview-session';

export async function exitPreviewAction(): Promise<void> {
  await clearPreviewCookie();
  redirect('/concession/access-directory');
}
