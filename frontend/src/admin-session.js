export const SESSION_ENDED = 'Your session ended. Sign in again.';

// A 401 from any admin call means the session is gone; everything else is shown as-is.
export function handleApiError(error, ui) {
  if (error?.status === 401) ui.showSignIn(SESSION_ENDED);
  else ui.toast(error?.message ?? 'Something went wrong. Try again.');
}
