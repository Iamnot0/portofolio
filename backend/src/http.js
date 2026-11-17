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
