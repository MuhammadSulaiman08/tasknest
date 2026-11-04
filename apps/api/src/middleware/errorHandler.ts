import type { ErrorRequestHandler, RequestHandler } from 'express';
import { AppError } from '../lib/AppError.js';
import { logger } from '../lib/logger.js';

// Map PostgreSQL unique-constraint names to friendly 409 errors
const uniqueViolations: Record<string, [string, string, string]> = {
  users_email_uq: ['EMAIL_TAKEN', 'An account with this email already exists', 'email'],
  workspaces_slug_uq: ['SLUG_TAKEN', 'This workspace URL is already taken', 'slug'],
  projects_workspace_key_uq: ['PROJECT_KEY_TAKEN', 'A project with this key already exists', 'key'],
};

export const notFoundHandler: RequestHandler = (_req, _res, next) => {
  next(new AppError(404, 'ROUTE_NOT_FOUND', 'Route not found'));
};

export const errorHandler: ErrorRequestHandler = (err, req, res, _next) => {
  let error = err;
  if (err?.code === '23505' && uniqueViolations[err.constraint]) {
    const [code, message, field] = uniqueViolations[err.constraint];
    error = new AppError(409, code, message, { [field]: message });
  }
  if (err?.type === 'entity.parse.failed') error = new AppError(400, 'BAD_REQUEST', 'Malformed JSON body');

  if (!(error instanceof AppError)) {
    logger.error({ err, requestId: req.id }, 'unhandled error');
    error = new AppError(500, 'INTERNAL', 'Something went wrong on our side');
  }
  const e = error as AppError;
  res.status(e.status).json({
    error: { code: e.code, message: e.message, ...(e.fields && { fields: e.fields }), requestId: req.id },
  });
};
