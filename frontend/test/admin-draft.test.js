import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { ApiError } from '../src/api.js';
import { createDraftStore, reconcileDraft, saveDraft } from '../src/admin-draft.js';

const BLOB = 'https://abc.public.blob.vercel-storage.com/projects/shot-x1.png';

function setup({ send } = {}) {
  const drafts = createDraftStore();
  const calls = { signIn: [], toast: [], uploads: [], sends: [] };
  const ui = {
    showSignIn: (message) => calls.signIn.push(message),
    toast: (message) => calls.toast.push(message),
    hasDraft: () => drafts.has(),
  };
  const deps = {
    drafts,
    ui,
    uploadImage: async (file, title) => {
      calls.uploads.push({ file, title });
      return BLOB;
    },
    send: async (method, path, body) => {
      calls.sends.push({ method, path, body });
      return send ? send(calls.sends.length) : null;
    },
  };
  return { drafts, calls, deps };
}

const draftOf = (overrides = {}) => ({
  kind: 'projects',
  id: null,
  imageUrl: null,
  file: null,
  uploadedUrl: null,
  values: { title: 'Atlas', purpose: 'Recon', stack: 'Node', link: null, published: false },
  ...overrides,
});

describe('saveDraft', () => {
  it('keeps the draft and tells the user so when the session has ended', async () => {
    const { drafts, calls, deps } = setup({ send: () => { throw new ApiError(401, 'Sign in required'); } });
    const draft = draftOf();
    assert.equal(await saveDraft(draft, deps), false);
    assert.equal(drafts.has(), true);
    assert.deepEqual(calls.signIn, ['Your session ended. Sign in again. Your unsaved changes are kept.']);
    assert.deepEqual(calls.toast, []);
  });

  it('rethrows other failures without keeping the draft', async () => {
    const { drafts, calls, deps } = setup({ send: () => { throw new ApiError(400, 'Title is required'); } });
    await assert.rejects(saveDraft(draftOf(), deps), { status: 400, message: 'Title is required' });
    assert.equal(drafts.has(), false);
    assert.deepEqual(calls.signIn, []);
  });

  it('creates with POST and updates with PUT, including the existing image', async () => {
    const created = setup();
    assert.equal(await saveDraft(draftOf(), created.deps), true);
    assert.deepEqual(created.calls.sends[0], {
      method: 'POST',
      path: '/api/admin/projects',
      body: { title: 'Atlas', purpose: 'Recon', stack: 'Node', link: null, published: false, imageUrl: null },
    });

    const updated = setup();
    await saveDraft(draftOf({ id: 7, imageUrl: BLOB }), updated.deps);
    assert.equal(updated.calls.sends[0].method, 'PUT');
    assert.equal(updated.calls.sends[0].path, '/api/admin/projects/7');
    assert.equal(updated.calls.sends[0].body.imageUrl, BLOB);
    assert.equal(updated.calls.uploads.length, 0);
  });

  it('uploads the chosen file once and reuses its URL on every retry', async () => {
    const { calls, deps } = setup({ send: (n) => { if (n === 1) throw new ApiError(500, 'Try again'); } });
    const file = { name: 'a.png', type: 'image/png', size: 1 };
    const draft = draftOf({ file });

    await assert.rejects(saveDraft(draft, deps), { status: 500 });
    assert.equal(draft.uploadedUrl, BLOB);

    assert.equal(await saveDraft(draft, deps), true);
    assert.equal(calls.uploads.length, 1);
    assert.deepEqual(calls.uploads[0], { file, title: 'Atlas' });
    assert.equal(calls.sends[1].body.imageUrl, BLOB);
  });
});

describe('createDraftStore', () => {
  it('returns the kept draft once, with the same values', () => {
    const drafts = createDraftStore();
    const draft = draftOf({ id: 3 });
    drafts.keep(draft);
    assert.equal(drafts.take(), draft);
    assert.equal(drafts.take(), null);
    assert.equal(drafts.has(), false);
  });

  it('forgets the draft when cleared, as on sign out', () => {
    const drafts = createDraftStore();
    drafts.keep(draftOf());
    drafts.clear();
    assert.equal(drafts.has(), false);
    assert.equal(drafts.take(), null);
  });
});

describe('reconcileDraft', () => {
  it('keeps the id while the item still exists', () => {
    const draft = draftOf({ id: 2 });
    assert.deepEqual(reconcileDraft(draft, [{ id: 1 }, { id: 2 }]), { draft, missing: false });
  });

  it('keeps new items as they are', () => {
    const draft = draftOf();
    assert.deepEqual(reconcileDraft(draft, []), { draft, missing: false });
  });

  it('turns a deleted item into a new one with the same values', () => {
    const draft = draftOf({ id: 9 });
    const result = reconcileDraft(draft, [{ id: 1 }]);
    assert.equal(result.missing, true);
    assert.equal(result.draft.id, null);
    assert.deepEqual(result.draft.values, draft.values);
  });

  it('trusts the id when the list could not be loaded', () => {
    const draft = draftOf({ id: 9 });
    assert.deepEqual(reconcileDraft(draft, [], true), { draft, missing: false });
  });
});
