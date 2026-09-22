import type { z } from 'zod';
import type { FieldError } from '@cocktail/shared';
import { ValidationError } from './errors.js';

function toFieldErrors(error: z.ZodError): FieldError[] {
  return error.issues.map((issue) => ({
    // zod 4 types paths as PropertyKey[], so symbols are possible in theory.
    path: issue.path.map(String).join('.') || '(root)',
    message: issue.message,
  }));
}

/**
 * Parses untrusted input against a schema, raising a domain error on failure.
 *
 * Zod's own `error.message` is a serialized dump of its internal issue objects;
 * sending that to clients leaks schema internals and is unusable in a UI.
 *
 * Keyed on the schema rather than a bare `T` so the result is the schema's
 * *output* type — otherwise `.default()` values are typed as still-optional.
 */
export function parseOrThrow<S extends z.ZodType>(schema: S, input: unknown): z.output<S> {
  const result: z.ZodSafeParseResult<z.output<S>> = schema.safeParse(input);
  if (!result.success) {
    throw new ValidationError(toFieldErrors(result.error));
  }
  return result.data;
}
