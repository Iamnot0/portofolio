// Portfolio content shared by the public site and the admin dashboard.
const API = import.meta.env.VITE_API_BASE ?? 'https://www.aungkaungkhant.work';
const PLACEHOLDER_PURPOSE = /^(project|saas)\s*\d+$/i;

// Selected work is curated: these lead, and retired database rows are hidden.
// In the real build this curation lives in the database, managed from the admin dashboard.
const FEATURED_PROJECTS = [
  {
    title: 'MR ROBOT · Optimus Technica',
    purpose: 'Managed IT, business automation and custom software in Myanmar.',
    link: 'https://optimustechnica.com/',
    image: '/work/optimus-technica.webp',
  },
  {
    title: 'Leyar Shift',
    purpose: 'NASA Space Apps Challenge 2026. Compares crop rotations for a field by water, income and weather risk, using NASA Earth data.',
    link: 'https://leyarshift.earth/',
    image: '/work/leyar-shift.webp',
  },
  {
    title: 'Knowledge Center',
    purpose: 'Optimus Technica’s learning library: guides, technical references and field notes from the team.',
    link: 'https://knowledgecenter.optimustechnica.com/',
    image: '/work/knowledge-center.webp',
  },
  {
    title: 'PARADOX',
    purpose: 'Online store for PARADOX, a streetwear brand born in Burma in 2020.',
    link: 'https://burmesedox.com/',
    image: '/work/paradox.webp',
  },
];

const RETIRED_PROJECTS = new Set([
  'SLOW BAR',
  'SEIN LIN ELECTRONIC CENTER',
  'MR ROBOT COMPUTER SERVICE',
  'ZENITHLOVESDAISY',
  'TATTOO HOUSE',
  'PARADOX POS',
  'AI POWERED CONTENT CREATOR',
]);

// Certificates not yet in the database.
const LOCAL_CERTS = [
  { title: 'NASA Space Apps Challenge 2026: Galactic Problem Solver', meta: 'NASA · Nov 2026', image: '/certs/nasa-space-apps-2026.webp' },
  {
    title: 'Certified LLM Security Expert (CLLMSE)',
    meta: 'Red Team Leaders · Jul 2026',
    image: '/certs/cllmse-2026.webp',
    verify: 'https://courses.redteamleaders.com/exam-completion/353ec986ea299586',
  },
  {
    title: 'Certified LLM Security Professional (CLLMSP)',
    meta: 'Red Team Leaders · Jun 2026',
    image: '/certs/cllmsp-2026.webp',
    verify: 'https://courses.redteamleaders.com/exam-completion/60e9e4410d07bbc5',
  },
];

const SIGNATURES = [
  ['/9j/', 'image/jpeg'],
  ['iVBORw0KGgo', 'image/png'],
  ['UklGR', 'image/webp'],
  ['R0lGOD', 'image/gif'],
];

export function el(tag, { className, text, attrs } = {}, children = []) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text != null) node.textContent = text;
  if (attrs) for (const [key, value] of Object.entries(attrs)) node.setAttribute(key, value);
  for (const child of children) if (child) node.append(child);
  return node;
}

// Accepts typed image data URLs and site-relative paths. Some uploads were stored as
// application/octet-stream, so the real type is read from the payload's magic bytes.
export function imageSource(src) {
  if (typeof src !== 'string') return null;
  if (/^\/[\w\-./]+\.(webp|png|jpe?g)$/i.test(src)) return src;
  if (/^data:image\/(png|jpe?g|gif|webp);base64,/i.test(src)) return src;
  const untyped = /^data:application\/octet-stream;base64,(.*)$/is.exec(src);
  if (!untyped) return null;
  const match = SIGNATURES.find(([signature]) => untyped[1].startsWith(signature));
  return match ? `data:${match[1]};base64,${untyped[1]}` : null;
}

export function publicLink(href) {
  try {
    const url = new URL(href);
    if (url.protocol !== 'https:' && url.protocol !== 'http:') return null;
    if (['localhost', '127.0.0.1', '0.0.0.0'].includes(url.hostname)) return null;
    return url.href;
  } catch {
    return null;
  }
}

export function hostname(href) {
  return href ? new URL(href).hostname : '';
}

function parseDescription(raw) {
  try {
    const data = JSON.parse(raw);
    if (data && typeof data === 'object') return data;
  } catch {
    // Older rows store plain text instead of the structured JSON.
  }
  return { purpose: raw };
}

async function getJSON(path) {
  const response = await fetch(`${API}${path}`);
  if (!response.ok) throw new Error(`${path} responded ${response.status}`);
  const body = await response.json();
  if (!body.success) throw new Error(body.error ?? `${path} failed`);
  return body.data;
}

function fromDatabaseProject(row) {
  const details = parseDescription(row.description ?? '');
  const purpose = typeof details.purpose === 'string' ? details.purpose.trim() : '';
  return {
    title: row.title.trim(),
    purpose: PLACEHOLDER_PURPOSE.test(purpose) ? '' : purpose,
    stack: typeof details.techStack === 'string' ? details.techStack.replace(/\s+/g, ' ').trim() : '',
    link: publicLink(row.link),
    image: imageSource(row.image),
  };
}

export async function getProjects() {
  let rows = [];
  try {
    rows = await getJSON('/api/projects');
  } catch {
    // Featured projects still render when the API is unreachable.
  }
  return [
    ...FEATURED_PROJECTS.map((project) => ({ stack: '', ...project })),
    ...rows.filter((row) => !RETIRED_PROJECTS.has(row.title.trim().toUpperCase())).map(fromDatabaseProject),
  ];
}

export async function getCertificates() {
  let rows = [];
  try {
    rows = await getJSON('/api/certificates');
  } catch {
    // Local certificates still render when the API is unreachable.
  }
  return [
    ...LOCAL_CERTS.map((cert) => ({ verify: null, ...cert })),
    ...rows.map((row) => ({ title: row.title.trim(), meta: '', image: imageSource(row.image), verify: null })),
  ];
}

export async function getCV() {
  try {
    const cv = await getJSON('/api/cv');
    if (!cv || !/^data:application\/pdf;base64,/i.test(cv.file_data)) return null;
    return { name: cv.file_name, data: cv.file_data, uploadedAt: cv.uploaded_at };
  } catch {
    return null;
  }
}

export async function openPdf(dataUrl) {
  const blob = await (await fetch(dataUrl)).blob();
  const url = URL.createObjectURL(blob);
  window.open(url, '_blank', 'noopener');
  setTimeout(() => URL.revokeObjectURL(url), 60_000);
}
