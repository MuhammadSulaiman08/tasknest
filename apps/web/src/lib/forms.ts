import type { ZodSchema } from 'zod';
import { ApiRequestError } from './api';

/** Validate with a shared Zod schema; returns field errors keyed by field name, or null if valid. */
export function fieldErrors(schema: ZodSchema, values: unknown): Record<string, string> | null {
  const r = schema.safeParse(values);
  if (r.success) return null;
  const out: Record<string, string> = {};
  for (const i of r.error.issues) out[String(i.path[0] ?? '_')] ??= i.message;
  return out;
}

export function errorMessage(err: unknown) {
  return err instanceof ApiRequestError ? err.message : 'Something went wrong, try again';
}
