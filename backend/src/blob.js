import { del } from '@vercel/blob';
import { handleUpload } from '@vercel/blob/client';

// Adapts the Vercel Blob SDK to the narrow interface the routes depend on.
export function createVercelBlob(token) {
  return {
    handleUpload: (request, body, options) => handleUpload({ request, body, token, ...options }),
    del: (url) => del(url, { token }),
  };
}
