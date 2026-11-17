import { upload } from '@vercel/blob/client';
import { ApiError, apiGet, apiSend } from './api.js';
import { checkCv, checkImage, uploadPathname } from './admin-upload.js';
import { handleApiError } from './admin-session.js';
import { el, hostname, publicLink } from './data.js';

const login = document.getElementById('login');
const loginForm = document.getElementById('loginForm');
const loginError = document.getElementById('loginError');
const dashboard = document.getElementById('dashboard');
const toastEl = document.getElementById('toast');
const lists = {
  projects: document.getElementById('projectList'),
  certificates: document.getElementById('certificateList'),
};
const state = {
  signedIn: false,
  projects: [],
  certificates: [],
  failed: { projects: false, certificates: false },
  ordering: new Set(),
  cv: null,
  cvFailed: false,
  editing: null,
};

let toastTimer = 0;
function toast(message) {
  toastEl.textContent = message;
  toastEl.classList.add('is-visible');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => toastEl.classList.remove('is-visible'), 3200);
}

const ui = { showSignIn, toast };
const fail = (error) => handleApiError(error, ui);

/* Theme */
const themeToggle = document.getElementById('themeToggle');
function applyTheme(theme) {
  document.documentElement.dataset.theme = theme;
  themeToggle.textContent = theme === 'dark' ? 'Light' : 'Dark';
  themeToggle.setAttribute('aria-pressed', String(theme === 'dark'));
  themeToggle.setAttribute('aria-label', `Switch to ${theme === 'dark' ? 'light' : 'dark'} theme`);
}
applyTheme(document.documentElement.dataset.theme);
themeToggle.addEventListener('click', () => {
  const next = document.documentElement.dataset.theme === 'dark' ? 'light' : 'dark';
  try { localStorage.setItem('theme', next); } catch { /* storage unavailable: theme still switches */ }
  applyTheme(next);
});

/* Session */
function showSignIn(message = '') {
  state.signedIn = false;
  state.projects = [];
  state.certificates = [];
  state.cv = null;
  for (const { dialog } of Object.values(editors)) if (dialog.open) dialog.close();
  dashboard.hidden = true;
  login.hidden = false;
  loginError.textContent = message;
}

function showDashboard() {
  state.signedIn = true;
  login.hidden = true;
  dashboard.hidden = false;
  loadAll();
}

async function restoreSession() {
  try {
    const { signedIn } = await apiGet('/api/auth/session');
    if (signedIn) showDashboard();
    else showSignIn();
  } catch (error) {
    showSignIn(error.message);
  }
}

loginForm.addEventListener('submit', async (event) => {
  event.preventDefault();
  const { email, password, code } = loginForm.elements;
  const problem = !email.value || !email.validity.valid
    ? ['Enter the email you sign in with.', email]
    : !password.value
      ? ['Enter your password.', password]
      : !code.validity.valid || !code.value
        ? ['Enter the 6-digit code from your authenticator app.', code]
        : null;
  if (problem) {
    loginError.textContent = problem[0];
    problem[1].focus();
    return;
  }

  const submit = loginForm.querySelector('[type="submit"]');
  loginError.textContent = '';
  submit.disabled = true;
  submit.textContent = 'Signing in…';
  try {
    await apiSend('POST', '/api/auth/login', { email: email.value.trim(), password: password.value, code: code.value });
    loginForm.reset();
    showDashboard();
  } catch (error) {
    loginError.textContent = error.message;
    code.value = '';
  } finally {
    submit.disabled = false;
    submit.textContent = 'Sign in';
  }
});

document.getElementById('signOut').addEventListener('click', async () => {
  try {
    await apiSend('POST', '/api/auth/logout');
    showSignIn();
  } catch (error) {
    fail(error);
  }
});

/* Tabs */
const tabs = [...document.querySelectorAll('[role="tab"]')];
function selectTab(tab) {
  for (const t of tabs) {
    const selected = t === tab;
    t.setAttribute('aria-selected', String(selected));
    t.tabIndex = selected ? 0 : -1;
    document.getElementById(t.getAttribute('aria-controls')).hidden = !selected;
  }
  tab.focus();
}
tabs.forEach((tab, i) => {
  tab.addEventListener('click', () => selectTab(tab));
  tab.addEventListener('keydown', (event) => {
    if (event.key !== 'ArrowRight' && event.key !== 'ArrowLeft') return;
    event.preventDefault();
    const step = event.key === 'ArrowRight' ? 1 : -1;
    selectTab(tabs[(i + step + tabs.length) % tabs.length]);
  });
});

/* Lists */
const COPY = {
  projects: {
    empty: 'No projects yet. Add your first one and it appears in the Work section.',
    failed: 'Couldn’t load projects. Check your connection and reload.',
    loading: 'Loading projects…',
  },
  certificates: {
    empty: 'No certificates yet. Add one and it appears under Certifications.',
    failed: 'Couldn’t load certificates. Check your connection and reload.',
    loading: 'Loading certificates…',
  },
};

function detailFor(kind, item) {
  if (kind === 'projects') {
    const link = publicLink(item.link);
    return link ? hostname(link) : 'Not deployed';
  }
  return item.issuerMeta || 'Add the issuer and date';
}

function adminRow(item, index, total, kind) {
  const busy = state.ordering.has(kind);
  const up = el('button', { className: 'icon-button', text: '↑', attrs: { type: 'button', 'aria-label': `Move ${item.title} up` } });
  const down = el('button', { className: 'icon-button', text: '↓', attrs: { type: 'button', 'aria-label': `Move ${item.title} down` } });
  up.disabled = busy || index === 0;
  down.disabled = busy || index === total - 1;
  up.addEventListener('click', () => move(kind, index, index - 1));
  down.addEventListener('click', () => move(kind, index, index + 1));

  const edit = el('button', { className: 'quiet-link', text: 'Edit', attrs: { type: 'button' } });
  const del = el('button', { className: 'quiet-link quiet-link--danger', text: 'Delete', attrs: { type: 'button' } });
  edit.addEventListener('click', () => openEditor(kind, item));
  del.addEventListener('click', () => remove(kind, item));

  const image = publicLink(item.imageUrl);
  const row = el('li', { className: 'admin-row', attrs: { draggable: 'true' } }, [
    el('span', { className: 'drag-handle', text: '⋮⋮', attrs: { 'aria-hidden': 'true' } }),
    image
      ? el('img', { className: 'admin-thumb', attrs: { src: image, alt: '', loading: 'lazy' } })
      : el('span', { className: 'admin-thumb admin-thumb--empty', text: 'No image' }),
    el('div', { className: 'admin-main' }, [
      el('p', { className: 'admin-title', text: item.title }),
      el('p', { className: 'admin-detail' }, [
        detailFor(kind, item),
        item.published ? null : el('span', { className: 'admin-flag', text: 'Hidden' }),
      ]),
    ]),
    el('div', { className: 'admin-order' }, [up, down]),
    el('div', { className: 'admin-row-actions' }, [edit, del]),
  ]);
  row.dataset.index = String(index);
  return row;
}

function render(kind) {
  const items = state[kind];
  const message = state.failed[kind] ? COPY[kind].failed : COPY[kind].empty;
  lists[kind].replaceChildren(...(items.length
    ? items.map((item, i) => adminRow(item, i, items.length, kind))
    : [el('li', { className: 'admin-state', text: message })]));
}

async function loadList(kind) {
  try {
    const rows = await apiGet(`/api/admin/${kind}`);
    state[kind] = Array.isArray(rows) ? rows : [];
    state.failed[kind] = false;
  } catch (error) {
    state.failed[kind] = true;
    if (error.status === 401) fail(error);
    else state[kind] = [];
  }
  if (state.signedIn) render(kind);
}

async function loadCv() {
  try {
    state.cv = await apiGet('/api/cv');
    state.cvFailed = false;
  } catch {
    state.cv = null;
    state.cvFailed = true;
  }
  renderCV();
}

function loadAll() {
  for (const kind of Object.keys(lists)) {
    lists[kind].replaceChildren(el('li', { className: 'admin-state', text: COPY[kind].loading }));
  }
  return Promise.all([loadList('projects'), loadList('certificates'), loadCv()]);
}

async function move(kind, from, to) {
  const previous = state[kind];
  if (state.ordering.has(kind) || to < 0 || to >= previous.length || from === to) return;

  const next = [...previous];
  next.splice(to, 0, ...next.splice(from, 1));
  state[kind] = next;
  state.ordering.add(kind);
  render(kind);
  try {
    await apiSend('PUT', `/api/admin/${kind}/order`, { ids: next.map((item) => item.id) });
    toast('Order saved.');
  } catch (error) {
    if (state[kind] === next) state[kind] = previous;
    fail(error);
  } finally {
    state.ordering.delete(kind);
    if (state.signedIn) render(kind);
  }
}

async function remove(kind, item) {
  if (!window.confirm(`Delete “${item.title}”? Visitors will no longer see it.`)) return;
  try {
    await apiSend('DELETE', `/api/admin/${kind}/${item.id}`);
    await loadList(kind);
    toast('Deleted.');
  } catch (error) {
    fail(error);
  }
}

function enableDrag(kind) {
  const list = lists[kind];
  let from = null;
  const clearMarks = () => {
    for (const node of list.querySelectorAll('.is-dragging, .is-drop-target')) node.classList.remove('is-dragging', 'is-drop-target');
  };
  list.addEventListener('dragstart', (event) => {
    const row = event.target.closest('.admin-row');
    if (!row) return;
    from = Number(row.dataset.index);
    row.classList.add('is-dragging');
    event.dataTransfer.effectAllowed = 'move';
  });
  list.addEventListener('dragover', (event) => {
    if (from === null) return;
    event.preventDefault();
    const row = event.target.closest('.admin-row');
    for (const node of list.querySelectorAll('.is-drop-target')) node.classList.remove('is-drop-target');
    row?.classList.add('is-drop-target');
  });
  list.addEventListener('drop', (event) => {
    event.preventDefault();
    const row = event.target.closest('.admin-row');
    const start = from;
    from = null;
    clearMarks();
    if (row && start !== null) move(kind, start, Number(row.dataset.index));
  });
  list.addEventListener('dragend', () => {
    from = null;
    clearMarks();
  });
}

/* Uploads */
// The blob client hides the HTTP status, so a failed token request is checked against the session.
async function uploadFile(pathname, file, clientPayload) {
  try {
    return await upload(pathname, file, { access: 'public', handleUploadUrl: '/api/uploads', clientPayload });
  } catch {
    const { signedIn } = await apiGet('/api/auth/session').catch(() => ({ signedIn: true }));
    throw signedIn
      ? new ApiError(0, 'The upload failed. Check your connection and try again.')
      : new ApiError(401, 'Sign in required');
  }
}

/* Editors */
const editors = {
  projects: {
    dialog: document.getElementById('projectEditor'),
    form: document.getElementById('projectForm'),
    noun: 'project',
    fields: ['title', 'purpose', 'stack', 'link'],
    urlField: 'link',
    saveLabel: 'Save project',
  },
  certificates: {
    dialog: document.getElementById('certificateEditor'),
    form: document.getElementById('certificateForm'),
    noun: 'certificate',
    fields: ['title', 'issuerMeta', 'verifyUrl'],
    urlField: 'verifyUrl',
    saveLabel: 'Save certificate',
  },
};

function setPreview(form, src) {
  const img = form.querySelector('.editor-preview');
  img.hidden = !src;
  if (src) img.src = src;
  else img.removeAttribute('src');
}

function discardPreviewUrl() {
  if (state.editing?.previewUrl) URL.revokeObjectURL(state.editing.previewUrl);
}

function setSaving(kind, saving) {
  const { dialog, form, saveLabel } = editors[kind];
  for (const button of dialog.querySelectorAll('button, input')) button.disabled = saving;
  form.querySelector('[type="submit"]').textContent = saving ? 'Saving…' : saveLabel;
  state.editing.saving = saving;
}

function openEditor(kind, item = null) {
  const { dialog, form, noun, fields } = editors[kind];
  discardPreviewUrl();
  state.editing = { kind, id: item?.id ?? null, imageUrl: item?.imageUrl ?? null, file: null, previewUrl: null, saving: false };
  form.reset();
  dialog.querySelector('h2').textContent = item ? `Edit ${noun}` : `Add ${noun}`;
  for (const name of fields) form.elements[name].value = item?.[name] ?? '';
  form.elements.published.checked = item ? item.published : true;
  setPreview(form, publicLink(state.editing.imageUrl));
  form.querySelector('.form-error').textContent = '';
  dialog.showModal();
  form.elements.title.focus();
}

async function saveEditor(kind) {
  const { dialog, form, fields, urlField } = editors[kind];
  const error = form.querySelector('.form-error');
  const { editing } = state;
  const values = Object.fromEntries(fields.map((name) => [name, form.elements[name].value.trim()]));

  if (!values.title) {
    error.textContent = 'Add a title.';
    form.elements.title.focus();
    return;
  }
  if (values[urlField] && !publicLink(values[urlField])) {
    error.textContent = 'Use a full public URL that starts with https://';
    form.elements[urlField].focus();
    return;
  }

  error.textContent = '';
  setSaving(kind, true);
  try {
    const imageUrl = editing.file
      ? (await uploadFile(uploadPathname(kind, values.title, editing.file), editing.file, 'image')).url
      : editing.imageUrl;
    const body = { ...values, [urlField]: values[urlField] || null, imageUrl, published: form.elements.published.checked };
    await (editing.id === null
      ? apiSend('POST', `/api/admin/${kind}`, body)
      : apiSend('PUT', `/api/admin/${kind}/${editing.id}`, body));
    await loadList(kind);
    dialog.close();
    toast('Saved.');
  } catch (caught) {
    if (caught.status === 401) fail(caught);
    else error.textContent = caught.message;
  } finally {
    setSaving(kind, false);
  }
}

for (const [kind, { dialog, form }] of Object.entries(editors)) {
  dialog.querySelector('[data-close]').addEventListener('click', () => dialog.close());
  dialog.addEventListener('cancel', (event) => {
    if (state.editing?.saving) event.preventDefault();
  });
  dialog.addEventListener('close', discardPreviewUrl);

  form.elements.image.addEventListener('change', () => {
    const file = form.elements.image.files[0];
    const error = form.querySelector('.form-error');
    if (!file) return;
    const problem = checkImage(file);
    if (problem) {
      error.textContent = problem;
      form.elements.image.value = '';
      return;
    }
    discardPreviewUrl();
    state.editing.file = file;
    state.editing.previewUrl = URL.createObjectURL(file);
    setPreview(form, state.editing.previewUrl);
    error.textContent = '';
  });

  form.addEventListener('submit', (event) => {
    event.preventDefault();
    saveEditor(kind);
  });
}

document.getElementById('addProject').addEventListener('click', () => openEditor('projects'));
document.getElementById('addCertificate').addEventListener('click', () => openEditor('certificates'));

/* CV */
function renderCV() {
  const card = document.getElementById('cvCard');
  if (!state.cv) {
    const message = state.cvFailed
      ? 'Couldn’t load the CV. Check your connection and reload.'
      : 'No CV uploaded yet. Visitors won’t see a download link until you add one.';
    card.replaceChildren(el('p', { className: 'admin-state', text: message }));
    return;
  }
  const href = publicLink(state.cv.fileUrl);
  const uploaded = state.cv.uploadedAt
    ? new Date(state.cv.uploadedAt).toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' })
    : '';
  card.replaceChildren(
    el('div', { className: 'cv-meta' }, [
      el('p', { className: 'admin-title', text: state.cv.fileName }),
      uploaded ? el('p', { className: 'admin-detail', text: `Uploaded ${uploaded}` }) : null,
    ]),
    href ? el('a', { className: 'quiet-link', text: 'Open', attrs: { href, target: '_blank', rel: 'noopener' } }) : null,
  );
}

const cvInput = document.getElementById('cvInput');
const cvLabel = document.getElementById('cvLabel');

function setCvBusy(busy) {
  cvInput.disabled = busy;
  cvLabel.textContent = busy ? 'Uploading…' : 'Replace CV';
}

cvInput.addEventListener('change', async () => {
  const file = cvInput.files[0];
  cvInput.value = '';
  if (!file) return;
  const problem = checkCv(file);
  if (problem) {
    toast(problem);
    return;
  }
  setCvBusy(true);
  try {
    const blob = await uploadFile(uploadPathname('cv', null, file), file, 'cv');
    await apiSend('PUT', '/api/admin/cv', { fileUrl: blob.url, fileName: file.name });
    await loadCv();
    toast('CV replaced.');
  } catch (error) {
    fail(error);
  } finally {
    setCvBusy(false);
  }
});

enableDrag('projects');
enableDrag('certificates');
restoreSession();
