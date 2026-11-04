import type { RequestHandler } from 'express';
import type { ZodSchema } from 'zod';
import { AppError } from '../lib/AppError.js';

/** Validate req.body against a Zod schema; replaces the body with the parsed (trimmed, typed) value. */
export const validateBody =
  (schema: ZodSchema): RequestHandler =>
  (req, _res, next) => {
    const result = schema.safeParse(req.body ?? {});
    if (!result.success) {
      const fields: Record<string, string> = {};
      for (const issue of result.error.issues) {
        const key = issue.path.join('.') || '_';
        fields[key] ??= issue.message;
      }
      throw new AppError(422, 'VALIDATION_FAILED', 'Some fields are invalid', fields);
    }
    req.body = result.data;
    next();
  };
