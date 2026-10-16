import { describe, it, expect } from 'vitest';
import { readCookie, sessionCookieName, sessionCookieOptions } from '../src/lib/cookies.js';

const DAY = 86_400_000;

describe('cookies', () => {
  it('readCookie_multipleCookies_findsByName', () => {
    expect(readCookie('a=1; cocktail_session=tok; b=2', 'cocktail_session')).toBe('tok');
  });

  it('readCookie_missingHeader_undefined', () => {
    expect(readCookie(undefined, 'cocktail_session')).toBeUndefined();
  });

  it('readCookie_absentName_undefined', () => {
    expect(readCookie('a=1', 'cocktail_session')).toBeUndefined();
  });

  it('readCookie_encodedValue_decoded', () => {
    expect(readCookie('cocktail_session=a%2Bb', 'cocktail_session')).toBe('a+b');
  });

  it('readCookie_malformedEncoding_undefined', () => {
    expect(readCookie('cocktail_session=%E0%A4%A', 'cocktail_session')).toBeUndefined();
  });

  it('cookie_production_hostPrefixedAndSecure', () => {
    expect(sessionCookieName('production')).toBe('__Host-cocktail_session');
    expect(sessionCookieOptions('production', DAY)).toEqual({
      httpOnly: true,
      sameSite: 'strict',
      path: '/',
      secure: true,
      maxAge: DAY,
    });
  });

  it('cookie_development_plainNameNotSecure', () => {
    expect(sessionCookieName('development')).toBe('cocktail_session');
    expect(sessionCookieOptions('test', DAY)).toMatchObject({ secure: false, httpOnly: true });
  });
});
