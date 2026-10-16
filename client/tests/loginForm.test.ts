import { describe, it, expect } from 'vitest';
import { loginErrorMessage, safeReturnTo } from '../src/features/Auth/loginForm.js';
import { ApiError } from '../src/lib/http.js';

describe('safeReturnTo', () => {
  it('safeReturnTo_internalPath_kept', () => {
    expect(safeReturnTo('/mocktails?q=mint')).toBe('/mocktails?q=mint');
  });

  it('safeReturnTo_externalUrl_fallsBack', () => {
    expect(safeReturnTo('https://evil.example/')).toBe('/cocktails');
  });

  it('safeReturnTo_protocolRelative_fallsBack', () => {
    expect(safeReturnTo('//evil.example')).toBe('/cocktails');
  });

  it('safeReturnTo_backslashTrick_fallsBack', () => {
    // Browsers treat "/\host" like "//host": a protocol-relative URL to another site.
    expect(safeReturnTo(String.raw`/\evil.example`)).toBe('/cocktails');
  });

  it('safeReturnTo_missing_fallsBack', () => {
    expect(safeReturnTo(null)).toBe('/cocktails');
  });
});

describe('loginErrorMessage', () => {
  it('loginErrorMessage_401_wrongCredentials', () => {
    expect(loginErrorMessage(new ApiError(401, 'x', []))).toBe('Wrong username or password');
  });

  it('loginErrorMessage_429_usesServerMessage', () => {
    expect(
      loginErrorMessage(new ApiError(429, 'Too many requests — try again in a moment', [])),
    ).toBe('Too many requests — try again in a moment');
  });

  it('loginErrorMessage_503_notConfigured', () => {
    expect(loginErrorMessage(new ApiError(503, 'x', []))).toBe('Admin login is not configured');
  });

  it('loginErrorMessage_networkError_generic', () => {
    expect(loginErrorMessage(new TypeError('Failed to fetch'))).toBe(
      'Could not log in. Try again.',
    );
  });
});
