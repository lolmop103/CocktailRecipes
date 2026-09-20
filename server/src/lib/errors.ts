import type { FieldError } from '@cocktail/shared';

/**
 * Base class for errors the application raises deliberately, as opposed to
 * crashes. Carrying the HTTP status here lets services stay free of Express:
 * they throw domain errors and the error middleware does the translation.
 */
export abstract class AppError extends Error {
  abstract readonly status: number;

  constructor(message: string) {
    super(message);
    this.name = new.target.name;
  }
}

export class NotFoundError extends AppError {
  readonly status = 404;

  constructor(resource: string, id?: string) {
    super(id === undefined ? `${resource} not found` : `${resource} not found: ${id}`);
  }
}

export class ValidationError extends AppError {
  readonly status = 400;
  readonly errors: FieldError[];

  constructor(errors: FieldError[], message = 'Validation failed') {
    super(message);
    this.errors = errors;
  }
}

export function isAppError(err: unknown): err is AppError {
  return err instanceof AppError;
}
