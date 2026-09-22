import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { NextFunction, Request, Response } from 'express';
import createError from 'http-errors';
import { z } from 'zod';
import { errorHandler } from '../src/middleware/errorHandler.js';
import { AppError, NotFoundError, ValidationError } from '../src/lib/errors.js';
import { parseOrThrow } from '../src/lib/validation.js';
import { logger } from '../src/lib/logger.js';

class UpstreamError extends AppError {
  readonly status = 503;
}

function run(err: unknown) {
  const res = {
    status: vi.fn().mockReturnThis(),
    json: vi.fn().mockReturnThis(),
  };
  const req = { method: 'GET', path: '/api/test' } as Request;
  errorHandler(err, req, res as unknown as Response, vi.fn() as NextFunction);
  return res;
}

function fieldErrorsOf(fn: () => unknown): { path: string; message: string }[] {
  try {
    fn();
  } catch (err) {
    if (err instanceof ValidationError) return err.errors;
    throw err;
  }
  throw new Error('expected a ValidationError');
}

describe('errorHandler', () => {
  const logError = vi.spyOn(logger, 'error').mockImplementation(() => undefined);

  beforeEach(() => logError.mockClear());

  it('translatesNotFound_to404_withoutLogging', () => {
    const res = run(new NotFoundError('Recipe', '42'));

    expect(res.status).toHaveBeenCalledWith(404);
    expect(res.json).toHaveBeenCalledWith({ status: 404, message: 'Recipe not found: 42' });
    expect(logError).not.toHaveBeenCalled();
  });

  it('notFound_withoutId_omitsTheColon', () => {
    const res = run(new NotFoundError('Recipe'));

    expect(res.json).toHaveBeenCalledWith({ status: 404, message: 'Recipe not found' });
  });

  it('includesFieldErrors_forValidationFailures', () => {
    const errors = [{ path: 'name', message: 'Required' }];
    const res = run(new ValidationError(errors));

    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.json).toHaveBeenCalledWith({ status: 400, message: 'Validation failed', errors });
  });

  it('logsServerSideAppErrors_butStillAnswersStructured', () => {
    const res = run(new UpstreamError('database busy'));

    expect(res.status).toHaveBeenCalledWith(503);
    expect(logError).toHaveBeenCalledWith(
      'Request failed',
      expect.objectContaining({ status: 503 }),
    );
  });

  it('passesThrough_httpErrors', () => {
    const res = run(createError(418, 'short and stout'));

    expect(res.status).toHaveBeenCalledWith(418);
    expect(res.json).toHaveBeenCalledWith({ status: 418, message: 'short and stout' });
  });

  it('hidesUnknownErrors_behindA500', () => {
    const res = run(new Error('secret internals'));

    expect(res.status).toHaveBeenCalledWith(500);
    expect(res.json).toHaveBeenCalledWith({ status: 500, message: 'Internal Server Error' });
    expect(logError).toHaveBeenCalledWith(
      'Unhandled error',
      expect.objectContaining({ error: 'secret internals' }),
    );
  });

  it('copesWithNonErrorThrowables', () => {
    const res = run('a bare string');

    expect(res.status).toHaveBeenCalledWith(500);
    expect(logError).toHaveBeenCalledWith(
      'Unhandled error',
      expect.objectContaining({ error: 'a bare string', stack: undefined }),
    );
  });
});

describe('parseOrThrow', () => {
  it('reportsRootPath_whenTheWholeInputIsWrong', () => {
    const errors = fieldErrorsOf(() => parseOrThrow(z.object({}), 'not an object'));

    expect(errors[0]?.path).toBe('(root)');
  });

  it('joinsNestedPaths_withDots', () => {
    const schema = z.object({ a: z.object({ b: z.number() }) });
    const errors = fieldErrorsOf(() => parseOrThrow(schema, { a: { b: 'x' } }));

    expect(errors[0]?.path).toBe('a.b');
  });
});
