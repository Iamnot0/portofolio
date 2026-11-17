import { el, getCertificates, getCV, getProjects, hostname, publicLink } from './data.js';

const PREVIEW_NOTE = 'Preview only: changed on this page, not on your live site.';
const MAX_UPLOAD = 4 * 1024 * 1024;

const login = document.getElementById('login');
const dashboard = document.getElementById('dashboard');
const toastEl = document.getElementById('toast');
const lists = {
  projects: document.getElementById('projectList'),
  certificates: document.getElementById('certificateList'),
};
const state = { projects: [], certificates: [], cv: null, editing: null, loaded: false };

let toastTimer = 0;
function toast(message) {
  toastEl.textContent = message;
  toastEl.classList.add('is-visible');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => toastEl.classList.remove('is-visible'), 3200);
}

// Opens a CV that is either a stored https URL or a data URL picked in this session.
async function openPdf(source) {
  const blob = await (await fetch(source)).blob();
  const url = URL.createObjectURL(blob);
  window.open(url, '_blank', 'noopener');
  setTimeout(() => URL.revokeObjectURL(url), 60_000);
}

function readAsDataURL(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(file);
  });
}

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

/* Sign-in (preview: any well-formed email and password opens the dashboard) */
function showDashboard() {
  login.hidden = true;
  dashboard.hidden = false;
  if (!state.loaded) load();
}

function showLogin() {
  dashboard.hidden = true;
  login.hidden = false;
}

try {
  if (sessionStorage.getItem('admin-preview') === '1') showDashboard();
} catch {
  // Without session storage the preview simply starts at sign-in.
}

document.getElementById('loginForm').addEventListener('submit', (event) => {
  event.preventDefault();
  const form = event.currentTarget;
  const error = document.getElementById('loginError');
  if (!form.elements.email.validity.valid || !form.elements.email.value) {
    error.textContent = 'Enter the email you sign in with.';
    form.elements.email.focus();
    return;
  }
  if (!form.elements.password.value) {
    error.textContent = 'Enter your password.';
    form.elements.password.focus();
    return;
  }
  error.textContent = '';
  try { sessionStorage.setItem('admin-preview', '1'); } catch { /* preview continues without persistence */ }
  showDashboard();
});

document.getElementById('signOut').addEventListener('click', () => {
  try { sessionStorage.removeItem('admin-preview'); } catch { /* nothing to clear */ }
  showLogin();
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
const EMPTY = {
  projects: 'No projects yet. Add your first one and it appears in the Work section.',
  certificates: 'No certificates yet. Add one and it appears under Certifications.',
};

function adminRow(item, index, total, kind) {
  const detail = kind === 'projects'
    ? (item.link ? hostname(item.link) : 'Not deployed')
    : (item.meta || 'Add the issuer and date');
  const up = el('button', { className: 'icon-button', text: '↑', attrs: { type: 'button', 'aria-label': `Move ${item.title} up` } });
  const down = el('button', { className: 'icon-button', text: '↓', attrs: { type: 'button', 'aria-label': `Move ${item.title} down` } });
  up.disabled = index === 0;
  down.disabled = index === total - 1;
  up.addEventListener('click', () => move(kind, index, index - 1));
  down.addEventListener('click', () => move(kind, index, index + 1));

  const edit = el('button', { className: 'quiet-link', text: 'Edit', attrs: { type: 'button' } });
  const del = el('button', { className: 'quiet-link quiet-link--danger', text: 'Delete', attrs: { type: 'button' } });
  edit.addEventListener('click', () => openEditor(kind, index));
  del.addEventListener('click', () => remove(kind, index));

  const row = el('li', { className: 'admin-row', attrs: { draggable: 'true' } }, [
    el('span', { className: 'drag-handle', text: '⋮⋮', attrs: { 'aria-hidden': 'true' } }),
    item.image
      ? el('img', { className: 'admin-thumb', attrs: { src: item.image, alt: '', loading: 'lazy' } })
      : el('span', { className: 'admin-thumb admin-thumb--empty', text: 'No image' }),
    el('div', { className: 'admin-main' }, [
      el('p', { className: 'admin-title', text: item.title }),
      el('p', { className: 'admin-detail', text: detail }),
    ]),
    el('div', { className: 'admin-order' }, [up, down]),
    el('div', { className: 'admin-row-actions' }, [edit, del]),
  ]);
  row.dataset.index = String(index);
  return row;
}

function render(kind) {
  const items = state[kind];
  lists[kind].replaceChildren(...(items.length
    ? items.map((item, i) => adminRow(item, i, items.length, kind))
    : [el('li', { className: 'admin-state', text: EMPTY[kind] })]));
}

function move(kind, from, to) {
  const items = state[kind];
  if (to < 0 || to >= items.length || from === to) return;
  const [item] = items.splice(from, 1);
  items.splice(to, 0, item);
  render(kind);
  toast(`Order updated. ${PREVIEW_NOTE}`);
}

function remove(kind, index) {
  const item = state[kind][index];
  if (!window.confirm(`Delete “${item.title}”? Visitors will no longer see it.`)) return;
  state[kind].splice(index, 1);
  render(kind);
  toast(`Deleted. ${PREVIEW_NOTE}`);
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

/* Editors */
const editors = {
  projects: {
    dialog: document.getElementById('projectEditor'),
    form: document.getElementById('projectForm'),
    noun: 'project',
    fields: ['title', 'purpose', 'stack', 'link'],
    urlField: 'link',
  },
  certificates: {
    dialog: document.getElementById('certificateEditor'),
    form: document.getElementById('certificateForm'),
    noun: 'certificate',
    fields: ['title', 'meta', 'verify'],
    urlField: 'verify',
  },
};

function setPreview(form, src) {
  const img = form.querySelector('.editor-preview');
  img.hidden = !src;
  if (src) img.src = src;
  else img.removeAttribute('src');
}

function openEditor(kind, index = null) {
  const { dialog, form, noun, fields } = editors[kind];
  const item = index === null ? {} : state[kind][index];
  state.editing = { kind, index, image: item.image ?? null };
  form.reset();
  dialog.querySelector('h2').textContent = index === null ? `Add ${noun}` : `Edit ${noun}`;
  for (const name of fields) form.elements[name].value = item[name] ?? '';
  setPreview(form, state.editing.image);
  form.querySelector('.form-error').textContent = '';
  dialog.showModal();
  form.elements.title.focus();
}

for (const [kind, { dialog, form, fields, urlField }] of Object.entries(editors)) {
  dialog.querySelector('[data-close]').addEventListener('click', () => dialog.close());

  form.elements.image.addEventListener('change', async () => {
    const file = form.elements.image.files[0];
    const error = form.querySelector('.form-error');
    if (!file) return;
    if (file.size > MAX_UPLOAD) {
      error.textContent = 'Images must be 4 MB or smaller.';
      form.elements.image.value = '';
      return;
    }
    state.editing.image = await readAsDataURL(file);
    setPreview(form, state.editing.image);
    error.textContent = '';
  });

  form.addEventListener('submit', (event) => {
    event.preventDefault();
    const error = form.querySelector('.form-error');
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
    const item = { ...values, [urlField]: values[urlField] ? publicLink(values[urlField]) : null, image: state.editing.image };
    if (state.editing.index === null) state[kind].push(item);
    else state[kind][state.editing.index] = { ...state[kind][state.editing.index], ...item };
    dialog.close();
    render(kind);
    toast(`Saved. ${PREVIEW_NOTE}`);
  });
}

document.getElementById('addProject').addEventListener('click', () => openEditor('projects'));
document.getElementById('addCertificate').addEventListener('click', () => openEditor('certificates'));

/* CV */
function renderCV() {
  const card = document.getElementById('cvCard');
  if (!state.cv) {
    card.replaceChildren(el('p', { className: 'admin-state', text: 'No CV uploaded yet. Visitors won’t see a download link until you add one.' }));
    return;
  }
  const open = el('button', { className: 'quiet-link', text: 'Open', attrs: { type: 'button' } });
  open.addEventListener('click', () => openPdf(state.cv.data));
  const uploaded = state.cv.uploadedAt
    ? new Date(state.cv.uploadedAt).toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' })
    : '';
  card.replaceChildren(
    el('div', { className: 'cv-meta' }, [
      el('p', { className: 'admin-title', text: state.cv.name }),
      uploaded ? el('p', { className: 'admin-detail', text: `Uploaded ${uploaded}` }) : null,
    ]),
    open,
  );
}

document.getElementById('cvInput').addEventListener('change', async (event) => {
  const file = event.target.files[0];
  event.target.value = '';
  if (!file) return;
  if (file.type !== 'application/pdf') {
    toast('The CV must be a PDF.');
    return;
  }
  if (file.size > MAX_UPLOAD) {
    toast('The CV must be 4 MB or smaller.');
    return;
  }
  state.cv = { name: file.name, data: await readAsDataURL(file), uploadedAt: new Date().toISOString() };
  renderCV();
  toast(`CV replaced. ${PREVIEW_NOTE}`);
});

async function load() {
  state.loaded = true;
  const [projects, certificates, cv] = await Promise.all([getProjects(), getCertificates(), getCV()]);
  Object.assign(state, { projects, certificates, cv: cv && { name: cv.fileName, data: cv.fileUrl, uploadedAt: cv.uploadedAt } });
  render('projects');
  render('certificates');
  renderCV();
}

enableDrag('projects');
enableDrag('certificates');
