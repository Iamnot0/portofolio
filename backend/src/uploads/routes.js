import { Router } from 'express';
import { z } from 'zod';
import { HttpError, asyncRoute } from '../http.js';
import { requireAdmin } from '../auth/session.js';
import { parseBody } from '../content/schemas.js';

const MAX_UPLOAD_BYTES = 4 * 1024 * 1024;
const INVALID = 'Invalid upload request';

// A Map, so a client payload like "constructor" can never match an inherited property.
const UPLOAD_KINDS = new Map([
  ['image', { prefixes: ['projects/', 'certificates/'], allowedContentTypes: ['image/png', 'image/jpeg', 'image/webp'] }],
  ['cv', { prefixes: ['cv/'], allowedContentTypes: ['application/pdf'] }],
]);

// Only the token-generation event is accepted; the completion callback is never used.
const tokenRequestSchema = z.object(
  {
    type: z.literal('blob.generate-client-token', { error: INVALID }),
    payload: z.object(
      {
        pathname: z.string({ error: INVALID }).max(1024, INVALID),
        clientPayload: z.string({ error: INVALID }).nullable(),
        multipart: z.boolean({ error: INVALID }),
      },
      { error: INVALID },
    ),
  },
  { error: INVALID },
);

async function tokenOptionsFor(pathname, clientPayload) {
  const kind = UPLOAD_KINDS.get(clientPayload);
  if (!kind || !kind.prefixes.some((prefix) => pathname.startsWith(prefix) && pathname.length > prefix.length)) {
    throw new HttpError(400, INVALID);
  }
  return {
    allowedContentTypes: kind.allowedContentTypes,
    maximumSizeInBytes: MAX_UPLOAD_BYTES,
    addRandomSuffix: true,
  };
}

export function uploadsRouter(ctx) {
  const router = Router();

  router.post('/', requireAdmin(ctx), asyncRoute(async (req, res) => {
    const body = parseBody(tokenRequestSchema, req.body);
    res.json(await ctx.blob.handleUpload(req, body, { onBeforeGenerateToken: tokenOptionsFor }));
  }));

  return router;
}
