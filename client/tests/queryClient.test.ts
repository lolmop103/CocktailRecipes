import { describe, it, expect } from 'vitest';
import { createQueryClient, shouldRetry } from '../src/lib/queryClient.js';
import { ApiError } from '../src/lib/http.js';

describe('shouldRetry', () => {
  it('shouldRetry_429_false', () => {
    expect(shouldRetry(0, new ApiError(429, 'Too many requests', []))).toBe(false);
  });

  it('shouldRetry_400_false', () => {
    expect(shouldRetry(0, new ApiError(400, 'Validation failed', []))).toBe(false);
  });

  it('shouldRetry_500_onceOnly', () => {
    const error = new ApiError(500, 'Internal Server Error', []);

    expect(shouldRetry(0, error)).toBe(true);
    expect(shouldRetry(1, error)).toBe(false);
  });

  it('shouldRetry_networkError_onceOnly', () => {
    expect(shouldRetry(0, new TypeError('Failed to fetch'))).toBe(true);
    expect(shouldRetry(1, new TypeError('Failed to fetch'))).toBe(false);
  });

  it('createQueryClient_usesShouldRetryForQueries', () => {
    expect(createQueryClient().getDefaultOptions().queries?.retry).toBe(shouldRetry);
  });
});
