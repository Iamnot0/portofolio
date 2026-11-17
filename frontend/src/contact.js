import { ApiError, apiGet, apiSend } from './api.js';

const UNREACHABLE = 'Message could not be sent. Email clay.net@proton.me directly.';
// The server drops forms sent within 3 s of the token being issued; the extra half second absorbs latency.
const MIN_WAIT_MS = 3500;
// The server accepts a token for 24 h; refreshing well inside that keeps long-open tabs from being dropped.
const MAX_TOKEN_AGE_MS = 60 * 60 * 1000;

export async function submitContact(fields, fetchImpl = fetch) {
  try {
    await apiSend('POST', '/api/contact', fields, fetchImpl);
    return { ok: true };
  } catch (error) {
    if (!(error instanceof ApiError)) throw error;
    return { ok: false, error: error.status === 0 || error.status >= 500 ? UNREACHABLE : error.message };
  }
}

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

// The server issues the "form started" time as a signed token, so the visitor's clock is never trusted.
export function createContactSession({ fetchImpl = fetch, now = Date.now, wait = sleep } = {}) {
  let issued = null;
  let pending = null;

  const requestToken = () => {
    pending ??= apiGet('/api/contact/start', fetchImpl)
      .then((body) => {
        if (typeof body?.token !== 'string' || !body.token) throw new TypeError('Start response has no token');
        issued = { token: body.token, at: now() };
      })
      .catch(() => {})
      .finally(() => { pending = null; });
    return pending;
  };

  return {
    begin() {
      if (!issued) requestToken();
    },

    async submit(fields) {
      if (issued && now() - issued.at > MAX_TOKEN_AGE_MS) issued = null;
      if (!issued) await requestToken();
      if (!issued) await requestToken();
      if (!issued) return { ok: false, error: UNREACHABLE };

      const remaining = MIN_WAIT_MS - (now() - issued.at);
      if (remaining > 0) await wait(remaining);
      return submitContact({ ...fields, startToken: issued.token }, fetchImpl);
    },
  };
}
