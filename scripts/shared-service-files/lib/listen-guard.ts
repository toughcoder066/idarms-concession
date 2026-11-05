const LOOPBACK_HOSTS = new Set(['127.0.0.1', 'localhost', '::1']);

/**
 * Header identity (AUTH_MODE=disabled) believes whatever x-idarms-* headers a
 * request carries, so a service in that mode may only listen where no other
 * machine can connect, in every environment. Automated tests use Fastify's
 * inject() and never listen, so they can still use header identity.
 */
export function assertListenAllowed(authMode: string, host: string): void {
  if (authMode === 'disabled' && !LOOPBACK_HOSTS.has(host)) {
    throw new Error(
      `AUTH_MODE=disabled may only listen on a loopback host (127.0.0.1, localhost or ::1); got ${host}`,
    );
  }
}
