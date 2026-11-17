import { ApiError, apiSend } from './api.js';

const UNREACHABLE = 'Message could not be sent. Email clay.net@proton.me directly.';

export async function submitContact(fields, fetchImpl = fetch) {
  try {
    await apiSend('POST', '/api/contact', fields, fetchImpl);
    return { ok: true };
  } catch (error) {
    if (!(error instanceof ApiError)) throw error;
    return { ok: false, error: error.status === 0 ? UNREACHABLE : error.message };
  }
}
