import type { Capability } from '@idarms/contracts';
import { accessFromSession, type ConcessionAccess } from './access';
import type { Session } from 'next-auth';

export type AuthorizeResult =
  | { ok: true; access: ConcessionAccess & { concessionId: string; assemblyId: string } }
  | { ok: false; status: 401 | 403; message: string };

/**
 * Guard for a portal server action that acts inside one assembly, such as a
 * registration sent to CROIP with the concession's machine credential. The
 * services cannot check those calls, so the portal must: the user needs the
 * capability and a resolved assembly. The concession super admin at
 * portfolio level reads only and is refused (ADR-0002).
 */
export function authorizeAssemblyAction(session: Session | null, capability: Capability): AuthorizeResult {
  if (!session?.user || session.error) {
    return { ok: false, status: 401, message: 'Your session has ended. Sign in again.' };
  }
  const access = accessFromSession(session);
  if (!access.permissions.includes(capability)) {
    return { ok: false, status: 403, message: 'Your role does not allow this action.' };
  }
  if (access.concessionWide || !access.concessionId || !access.assemblyId) {
    return { ok: false, status: 403, message: 'This action needs an assembly workspace. Your account is not tied to one assembly.' };
  }
  return { ok: true, access: access as ConcessionAccess & { concessionId: string; assemblyId: string } };
}
