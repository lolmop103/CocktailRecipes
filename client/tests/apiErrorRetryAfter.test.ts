import { describe, it, expect, vi, afterEach } from 'vitest';
import { request, type ApiError } from '../src/lib/http.js';

const failWith = async (body: unknown): Promise<ApiError> => {
  vi.stubGlobal(
    'fetch',
    vi.fn().mockResolvedValue({
      ok: false,
      status: 429,
      statusText: 'Too Many Requests',
      json: () => Promise.resolve(body),
    }),
  );
  return (await request('/x').catch((e: unknown) => e)) as ApiError;
};

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('ApiError.retryAfterSeconds', () => {
  it('request_429WithRetryAfterSeconds_exposesIt', async () => {
    const error = await failWith({ status: 429, message: 'slow', retryAfterSeconds: 30 });
    expect(error.retryAfterSeconds).toBe(30);
  });

  it.each([
    ['absent', { message: 'slow' }],
    ['negative', { message: 'slow', retryAfterSeconds: -5 }],
    ['zero', { message: 'slow', retryAfterSeconds: 0 }],
    ['a string', { message: 'slow', retryAfterSeconds: '30' }],
    ['null', { message: 'slow', retryAfterSeconds: null }],
  ])('request_429With%sRetryAfter_leavesItUndefined', async (_name, body) => {
    const error = await failWith(body);
    expect(error.retryAfterSeconds).toBeUndefined();
  });
});
