import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { ApiError } from '../src/api.js';
import { handleApiError } from '../src/admin-session.js';

function fakeUi() {
  const calls = { signIn: [], toast: [] };
  return {
    calls,
    showSignIn: (message) => calls.signIn.push(message),
    toast: (message) => calls.toast.push(message),
  };
}

describe('handleApiError', () => {
  it('returns to sign-in with the session message on 401', () => {
    const ui = fakeUi();
    handleApiError(new ApiError(401, 'Sign in required'), ui);
    assert.deepEqual(ui.calls.signIn, ['Your session ended. Sign in again.']);
    assert.deepEqual(ui.calls.toast, []);
  });

  it('shows the API message as a toast for any other status', () => {
    const ui = fakeUi();
    handleApiError(new ApiError(400, 'Title is required'), ui);
    assert.deepEqual(ui.calls.toast, ['Title is required']);
    assert.deepEqual(ui.calls.signIn, []);
  });

  it('toasts a network failure message', () => {
    const ui = fakeUi();
    handleApiError(new ApiError(0, 'Could not reach the server. Check your connection and try again.'), ui);
    assert.equal(ui.calls.toast.length, 1);
    assert.equal(ui.calls.signIn.length, 0);
  });
});
