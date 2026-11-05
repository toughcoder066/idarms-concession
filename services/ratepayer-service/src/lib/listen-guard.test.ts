import { describe, expect, it } from 'vitest';
import { assertListenAllowed } from './listen-guard';

// Generated into every service by scripts/sync-role-model.mjs; this covers all copies.
describe('assertListenAllowed', () => {
  it.each(['127.0.0.1', 'localhost', '::1'])('lets header identity listen on %s', (host) => {
    expect(() => assertListenAllowed('disabled', host)).not.toThrow();
  });

  it.each(['0.0.0.0', '::', '192.168.1.20', 'idarms.internal'])('refuses header identity on %s', (host) => {
    expect(() => assertListenAllowed('disabled', host)).toThrow(/may only listen on a loopback host/);
  });

  it.each(['0.0.0.0', '127.0.0.1'])('lets ZITADEL auth listen on %s', (host) => {
    expect(() => assertListenAllowed('zitadel', host)).not.toThrow();
  });
});
