import assert from 'node:assert/strict';
import { readdirSync, readFileSync } from 'node:fs';
import { describe, it } from 'node:test';

const read = (url) => readFileSync(new URL(url, import.meta.url), 'utf8');

function connectSources() {
  const { headers } = JSON.parse(read('../../vercel.json'));
  const csp = headers
    .flatMap((rule) => rule.headers)
    .find((header) => header.key.toLowerCase() === 'content-security-policy').value;
  const directive = csp.split(';').map((part) => part.trim()).find((part) => part.startsWith('connect-src '));
  return directive.split(/\s+/).slice(1);
}

// CSP path matching: a source path ending in "/" matches any path beneath it, otherwise the path must match exactly.
function allows(source, target) {
  if (!source.startsWith('https://')) return false;
  const allowed = new URL(source);
  const url = new URL(target);
  if (allowed.origin !== url.origin) return false;
  return allowed.pathname.endsWith('/') ? url.pathname.startsWith(allowed.pathname) : url.pathname === allowed.pathname;
}

function blobUploadBase() {
  const dist = new URL('../node_modules/@vercel/blob/dist/', import.meta.url);
  for (const file of readdirSync(dist).filter((name) => name.endsWith('.js'))) {
    const match = read(new URL(file, dist)).match(/defaultVercelBlobApiUrl = "([^"]+)"/);
    if (match) return match[1];
  }
  throw new Error('The Blob client no longer declares its API base URL');
}

describe('Content Security Policy', () => {
  it('lets the browser reach every endpoint the Blob client uploads to', () => {
    const base = blobUploadBase();
    const requests = [`${base}/?pathname=cv.pdf`, `${base}/mpu?pathname=cv.pdf`];
    for (const request of requests) {
      assert.ok(
        connectSources().some((source) => allows(source, request)),
        `connect-src does not allow ${request}`,
      );
    }
  });
});
