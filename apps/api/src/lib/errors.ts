/**
 * App errors.
 *
 * The repository throws these and one Fastify handler turns them into status
 * codes. Keeping HTTP out of the data layer means the same repository works
 * from the CLI and from tests, with no request object needed.
 */

/** Every code a client can receive. The handler in app.ts emits all of these. */
export type ErrorCode =
  | 'BAD_REQUEST'
  | 'NOT_FOUND'
  | 'CONFLICT'
  | 'UNPROCESSABLE'
  | 'RATE_LIMITED'
  | 'INTERNAL'

export class AppError extends Error {
  readonly code: ErrorCode
  readonly status: number
  readonly details: unknown

  constructor(
    code: ErrorCode,
    status: number,
    message: string,
    details?: unknown,
  ) {
    super(message)
    this.name = new.target.name
    this.code = code
    this.status = status
    this.details = details
  }
}

export class NotFoundError extends AppError {
  constructor(message: string) {
    super('NOT_FOUND', 404, message)
  }
}

export class ConflictError extends AppError {
  constructor(message: string) {
    super('CONFLICT', 409, message)
  }
}

/** Well-formed but we still say no, like an unknown country code. */
export class UnprocessableError extends AppError {
  constructor(message: string, details?: unknown) {
    super('UNPROCESSABLE', 422, message, details)
  }
}

/** Postgres unique-violation. */
export const PG_UNIQUE_VIOLATION = '23505'

export function isPgError(
  error: unknown,
  code: string,
): error is { code: string } {
  return (
    typeof error === 'object' &&
    error !== null &&
    'code' in error &&
    (error as { code?: unknown }).code === code
  )
}
