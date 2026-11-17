import { handleApiError } from './admin-session.js';

// Holds an editor's unsaved state across a session expiry. One slot: the editor is modal.
export function createDraftStore() {
  let draft = null;
  return {
    keep(next) { draft = next; },
    take() {
      const kept = draft;
      draft = null;
      return kept;
    },
    clear() { draft = null; },
    has: () => draft !== null,
  };
}

// An item deleted elsewhere while signed out comes back as a new one, so nothing typed is lost.
export function reconcileDraft(draft, items, listFailed = false) {
  const gone = draft.id !== null && !listFailed && !items.some((item) => item.id === draft.id);
  return gone ? { draft: { ...draft, id: null }, missing: true } : { draft, missing: false };
}

// Resolves true when saved. An ended session keeps the draft and returns false; any other failure is thrown.
export async function saveDraft(draft, { uploadImage, send, drafts, ui }) {
  try {
    if (draft.file && !draft.uploadedUrl) draft.uploadedUrl = await uploadImage(draft.file, draft.values.title);
    const body = { ...draft.values, imageUrl: draft.uploadedUrl ?? draft.imageUrl };
    const path = `/api/admin/${draft.kind}`;
    await (draft.id === null ? send('POST', path, body) : send('PUT', `${path}/${draft.id}`, body));
    return true;
  } catch (error) {
    if (error.status !== 401) throw error;
    drafts.keep(draft);
    handleApiError(error, ui);
    return false;
  }
}
