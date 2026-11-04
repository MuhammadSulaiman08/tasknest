/** A typed, expected error. The error handler turns it into a JSON response. */
export class AppError extends Error {
  constructor(
    public status: number,
    public code: string,
    message?: string,
    public fields?: Record<string, string>,
  ) {
    super(message ?? code);
  }
}

export const notFound = (what: string) =>
  new AppError(404, `${what.toUpperCase()}_NOT_FOUND`, `${what[0].toUpperCase()}${what.slice(1)} not found`);
