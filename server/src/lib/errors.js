/**
 * Error with an HTTP status and a machine-readable code.
 * fieldErrors maps form field names to messages; the frontend shows them under inputs.
 */
export class AppError extends Error {
  constructor(status, message, { code = 'BAD_REQUEST', fieldErrors = null } = {}) {
    super(message)
    this.name = 'AppError'
    this.status = status
    this.code = code
    this.fieldErrors = fieldErrors
  }
}

export const badRequest = (message, fieldErrors) => new AppError(400, message, { code: 'VALIDATION', fieldErrors })
export const unauthorized = (message = 'Please sign in again') => new AppError(401, message, { code: 'UNAUTHENTICATED' })
export const forbidden = (message = 'You are not allowed to do that') => new AppError(403, message, { code: 'FORBIDDEN' })
export const notFound = (what = 'Resource') => new AppError(404, `${what} not found`, { code: 'NOT_FOUND' })
export const conflict = (message, code = 'CONFLICT') => new AppError(409, message, { code })
