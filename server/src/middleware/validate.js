import { badRequest } from '../lib/errors.js'

/** Turns zod issues into { field: message } for the frontend forms. */
export function zodFieldErrors(error) {
  const fieldErrors = {}
  for (const issue of error.issues) {
    const key = issue.path.join('.') || 'form'
    if (!fieldErrors[key]) fieldErrors[key] = issue.message
  }
  return fieldErrors
}

/**
 * validate({ body, query, params }) parses each part with its zod schema.
 * Parsed values (trimmed, converted, defaults applied) are stored on req.valid.
 */
export function validate(schemas) {
  return (req, _res, next) => {
    req.valid = {}
    for (const part of ['params', 'query', 'body']) {
      if (!schemas[part]) continue
      const result = schemas[part].safeParse(req[part] ?? {})
      if (!result.success) return next(badRequest('Please fix the highlighted fields', zodFieldErrors(result.error)))
      req.valid[part] = result.data
    }
    next()
  }
}
