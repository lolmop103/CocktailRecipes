import { describe, it, expect } from 'vitest';
import { ApiError, messageFor } from '../src/lib/http.js';

const LIMITED = 'Too many requests — try again in a moment';

describe('messageFor', () => {
  it('messageFor_429_serverMessage', () => {
    expect(messageFor(new ApiError(429, LIMITED, []), 'fallback')).toBe(LIMITED);
  });

  it('messageFor_500_fallback', () => {
    expect(messageFor(new ApiError(500, 'Internal Server Error', []), 'fallback')).toBe('fallback');
  });

  it('messageFor_networkError_fallback', () => {
    expect(messageFor(new TypeError('Failed to fetch'), 'fallback')).toBe('fallback');
  });
});
