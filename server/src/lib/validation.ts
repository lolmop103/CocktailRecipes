import type { output, SafeParseReturnType, ZodError, ZodTypeAny } from 'zod';
import type { FieldError } from '@cocktail/shared';
import { ValidationError } from './errors.js';

function toFieldErrors(error: ZodError): FieldError[] {
  return error.issues.map((issue) => ({
    path: issue.path.join('.') || '(root)',
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
export function parseOrThrow<S extends ZodTypeAny>(schema: S, input: unknown): output<S> {
  // Annotated because `ZodTypeAny.safeParse` widens its payload to `any`.
  const result: SafeParseReturnType<unknown, output<S>> = schema.safeParse(input);
  if (!result.success) {
    throw new ValidationError(toFieldErrors(result.error));
  }
  return result.data;
}
