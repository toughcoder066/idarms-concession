import { describe, expect, it } from 'vitest';
import { forwardedCookieHeader } from './forward-cookies';

describe('a refreshed session cookie reaches the rest of the request', () => {
  it('replaces a cookie the response sets', () => {
    expect(forwardedCookieHeader('a=1; authjs.session-token=old', ['authjs.session-token=new; Path=/; HttpOnly']))
      .toBe('a=1; authjs.session-token=new');
  });

  it('adds new chunks and drops expired ones', () => {
    expect(forwardedCookieHeader('authjs.session-token.0=x; authjs.session-token.1=y', [
      'authjs.session-token.0=new0; Path=/',
      'authjs.session-token.1=; Path=/; Max-Age=0',
      'authjs.session-token.2=new2; Path=/',
    ])).toBe('authjs.session-token.0=new0; authjs.session-token.2=new2');
  });

  it('drops a cookie expired by date', () => {
    expect(forwardedCookieHeader('a=1; b=2', ['b=; Expires=Thu, 01 Jan 1970 00:00:00 GMT'])).toBe('a=1');
  });

  it('works without request cookies', () => {
    expect(forwardedCookieHeader(null, ['a=1; Path=/'])).toBe('a=1');
  });
});
