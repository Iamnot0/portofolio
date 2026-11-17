export class HttpError extends Error {
  constructor(status, message) {
    super(message);
    this.name = 'HttpError';
    this.status = status;
  }
}

export const asyncRoute = (fn) => (req, res, next) => {
  Promise.resolve(fn(req, res, next)).catch(next);
};

export function notFound(req, res) {
  res.status(404).json({ error: 'Not found' });
}

const READ_ONLY_METHODS = new Set(['GET', 'HEAD']);

// Mutating requests must come from this site itself. The public contact form is exempt.
export function originGuard(req, res, next) {
  if (READ_ONLY_METHODS.has(req.method) || req.path === '/contact') return next();
  const proto = req.headers['x-forwarded-proto']?.split(',')[0].trim() || req.protocol;
  if (req.headers.origin === `${proto}://${req.headers.host}`) return next();
  next(new HttpError(403, 'Forbidden'));
}

const BODY_PARSER_ERRORS = {
  'entity.parse.failed': new HttpError(400, 'Invalid JSON'),
  'entity.too.large': new HttpError(413, 'Request body too large'),
};

// Only HttpError messages and the known body-parser failures reach the client.
export function errorHandler(err, req, res, next) {
  if (res.headersSent) return next(err);
  const known = err instanceof HttpError ? err : BODY_PARSER_ERRORS[err.type];
  if (known) return res.status(known.status).json({ error: known.message });
  console.error(err);
  res.status(500).json({ error: 'Something went wrong' });
}
