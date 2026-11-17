export class ApiError extends Error {
  constructor(status, message) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
  }
}

async function request(method, path, body, fetchImpl) {
  const init = { method };
  if (body !== undefined) {
    init.headers = { 'Content-Type': 'application/json' };
    init.body = JSON.stringify(body);
  }

  let response;
  try {
    response = await fetchImpl(path, init);
  } catch {
    throw new ApiError(0, 'Could not reach the server. Check your connection and try again.');
  }

  const payload = await response.json().catch(() => null);
  if (!response.ok) {
    throw new ApiError(response.status, typeof payload?.error === 'string' ? payload.error : 'Something went wrong. Try again.');
  }
  return payload;
}

export const apiGet = (path, fetchImpl = fetch) => request('GET', path, undefined, fetchImpl);

export const apiSend = (method, path, body, fetchImpl = fetch) => request(method, path, body, fetchImpl);
