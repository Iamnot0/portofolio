import { readFile } from 'node:fs/promises';
import { parseArgs as parseCli } from 'node:util';
import {
  FEATURED_PROJECTS,
  LOCAL_CERTIFICATES,
  PLACEHOLDER_PURPOSE,
  PUBLIC_DIR,
  RETIRED_PROJECT_TITLES,
} from '../seed-content.js';
import { decodeDataUrl, isImage, slugify, sniffFile } from './files.js';

const CONTENT_TABLES = ['portfolio_projects', 'portfolio_certificates', 'portfolio_cv'];
const LEGACY_TABLES = ['projects', 'certificates', 'cv_files'];
const LOCAL_HOSTS = new Set(['localhost', '127.0.0.1', '0.0.0.0']);

export function parseArgs(argv) {
  let values;
  try {
    ({ values } = parseCli({
      args: argv,
      options: { 'dry-run': { type: 'boolean' }, apply: { type: 'boolean' }, 'drop-old': { type: 'boolean' } },
    }));
  } catch (error) {
    throw new Error(error.message);
  }
  if (values['dry-run'] === values.apply) throw new Error('Pass exactly one of --dry-run or --apply.');
  if (values['drop-old'] && !values.apply) throw new Error('--drop-old requires --apply.');
  return { apply: Boolean(values.apply), dropOld: Boolean(values['drop-old']) };
}

async function assertTargetEmpty(query) {
  for (const table of CONTENT_TABLES) {
    const [{ total }] = await query(`select count(*)::int as total from ${table}`);
    if (total > 0) throw new Error(`${table} already has rows; refusing to move content into a populated target.`);
  }
}

const hasTable = async (db, table) =>
  (await db.query('select to_regclass($1) is not null as present', [`public.${table}`]))[0].present;

function asset(folder, name, bytes, file) {
  return { pathname: `${folder}/${slugify(name) || 'file'}.${file.extension}`, contentType: file.contentType, data: bytes };
}

async function localImage(publicDir, relativePath, folder, name) {
  const bytes = await readFile(new URL(relativePath, publicDir));
  const file = sniffFile(bytes);
  if (!isImage(file)) throw new Error(`${relativePath} is not a supported image`);
  return asset(folder, name, bytes, file);
}

function legacyImage(folder, name, stored, notes) {
  if (!stored) return null;
  const bytes = decodeDataUrl(stored);
  const file = bytes && sniffFile(bytes);
  if (!isImage(file)) {
    notes.push(`${name}: image is not a JPEG, PNG, WebP or GIF; migrated without an image`);
    return null;
  }
  return asset(folder, name, bytes, file);
}

// The API only accepts public https links, so anything else is dropped rather than carried over.
function publicLink(value, name, notes) {
  if (!value?.trim()) return null;
  const url = URL.parse(value.trim());
  if (url?.protocol === 'https:' && !url.username && !url.password && !LOCAL_HOSTS.has(url.hostname)) return url.href;
  notes.push(`${name}: link ${value.trim()} is not a public https URL; dropped`);
  return null;
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

async function legacyProjects(db, notes) {
  const rows = await db.query(
    `select id, title, description, link from projects
     where upper(trim(title)) = any($1::text[]) is not true
     order by display_order nulls last, id`,
    [RETIRED_PROJECT_TITLES],
  );
  const projects = [];
  for (const row of rows) {
    const title = row.title.trim();
    const details = parseDescription(row.description ?? '');
    const purpose = typeof details.purpose === 'string' ? details.purpose.trim() : '';
    const [{ image }] = await db.query('select image from projects where id = $1', [row.id]);
    projects.push({
      origin: 'old projects table',
      title,
      purpose: PLACEHOLDER_PURPOSE.test(purpose) ? '' : purpose,
      stack: typeof details.techStack === 'string' ? details.techStack.replace(/\s+/g, ' ').trim() : '',
      link: publicLink(row.link, title, notes),
      image: legacyImage('projects', title, image, notes),
    });
  }
  return projects;
}

async function legacyCertificates(db, notes) {
  const rows = await db.query('select id, title from certificates order by display_order nulls last, id');
  const certificates = [];
  for (const row of rows) {
    const title = row.title.trim();
    const [{ image }] = await db.query('select image from certificates where id = $1', [row.id]);
    certificates.push({
      origin: 'old certificates table',
      title,
      issuerMeta: '',
      verifyUrl: null,
      image: legacyImage('certificates', title, image, notes),
    });
  }
  return certificates;
}

async function legacyCv(db, notes) {
  const [row] = await db.query(
    'select id, file_name, uploaded_at from cv_files order by uploaded_at desc nulls last, id desc limit 1',
  );
  if (!row) return null;
  const [{ file_data: stored }] = await db.query('select file_data from cv_files where id = $1', [row.id]);
  const bytes = decodeDataUrl(stored);
  const file = bytes && sniffFile(bytes);
  if (file?.contentType !== 'application/pdf') {
    notes.push(`${row.file_name}: newest CV is not a PDF; not migrated`);
    return null;
  }
  const fileName = row.file_name?.trim() || 'cv.pdf';
  return {
    fileName,
    uploadedAt: row.uploaded_at,
    file: asset('cv', fileName.replace(/\.pdf$/i, ''), bytes, file),
  };
}

// Reads everything the move needs without writing anything. Refuses a populated target up front.
export async function buildPlan(db, { publicDir = PUBLIC_DIR } = {}) {
  await assertTargetEmpty((text) => db.query(text));
  const notes = [];

  const seeded = await Promise.all(
    FEATURED_PROJECTS.map(async ({ image, ...project }) => ({
      origin: 'seed',
      stack: '',
      ...project,
      image: await localImage(publicDir, image, 'projects', project.title),
    })),
  );
  const seededCertificates = await Promise.all(
    LOCAL_CERTIFICATES.map(async ({ image, ...certificate }) => ({
      origin: 'seed',
      ...certificate,
      image: await localImage(publicDir, image, 'certificates', certificate.title),
    })),
  );

  const [hasProjects, hasCertificates, hasCv] = await Promise.all(LEGACY_TABLES.map((table) => hasTable(db, table)));
  const retired = hasProjects
    ? await db.query('select id, title from projects where upper(trim(title)) = any($1::text[]) order by id', [
        RETIRED_PROJECT_TITLES,
      ])
    : [];

  return {
    projects: [...seeded, ...(hasProjects ? await legacyProjects(db, notes) : [])],
    certificates: [...seededCertificates, ...(hasCertificates ? await legacyCertificates(db, notes) : [])],
    cv: hasCv ? await legacyCv(db, notes) : null,
    retired,
    notes,
  };
}

const uploads = (plan) => [
  ...plan.projects.map((project) => project.image),
  ...plan.certificates.map((certificate) => certificate.image),
  plan.cv?.file,
].filter(Boolean);

const kilobytes = (asset) => `${(asset.data.length / 1024).toFixed(1)} KB`;
const imageLabel = (image) => (image ? `${image.pathname} (${image.contentType}, ${kilobytes(image)})` : 'no image');

export function describePlan(plan, { dropOld }) {
  const lines = [`projects: insert ${plan.projects.length}`];
  plan.projects.forEach((project, index) => {
    lines.push(`  ${index + 1}. ${project.title} [${project.origin}] ${imageLabel(project.image)}`);
  });
  lines.push(`certificates: insert ${plan.certificates.length}`);
  plan.certificates.forEach((certificate, index) => {
    lines.push(`  ${index + 1}. ${certificate.title} [${certificate.origin}] ${imageLabel(certificate.image)}`);
  });
  lines.push(
    plan.cv ? `cv: ${plan.cv.fileName} -> ${imageLabel(plan.cv.file)}` : 'cv: none to migrate',
    `uploads: ${uploads(plan).length} files to Blob`,
    `old projects: delete ${plan.retired.length} retired`,
  );
  for (const row of plan.retired) lines.push(`  - ${row.title.trim()}`);
  lines.push(dropOld ? 'old tables: projects, certificates and cv_files will be DROPPED' : 'old tables: kept');
  if (plan.notes.length) lines.push('notes:', ...plan.notes.map((note) => `  - ${note}`));
  return lines.join('\n');
}

// Uploads first (Blob cannot join a transaction), then every database write in one transaction.
export async function applyPlan(db, put, plan, { dropOld = false } = {}) {
  await assertTargetEmpty((text) => db.query(text));

  const upload = async (asset) => {
    if (!asset) return null;
    const { url } = await put(asset.pathname, asset.data, {
      access: 'public',
      addRandomSuffix: true,
      contentType: asset.contentType,
    });
    return url;
  };
  const withUrl = async (items) => {
    const result = [];
    for (const item of items) result.push({ ...item, imageUrl: await upload(item.image) });
    return result;
  };
  const projects = await withUrl(plan.projects);
  const certificates = await withUrl(plan.certificates);
  const cvUrl = await upload(plan.cv?.file);

  return db.transaction(async (query) => {
    await assertTargetEmpty(query);

    for (const [index, project] of projects.entries()) {
      await query(
        `insert into portfolio_projects (title, purpose, stack, link, image_url, display_order)
         values ($1, $2, $3, $4, $5, $6)`,
        [project.title, project.purpose, project.stack, project.link, project.imageUrl, index + 1],
      );
    }
    for (const [index, certificate] of certificates.entries()) {
      await query(
        `insert into portfolio_certificates (title, issuer_meta, verify_url, image_url, display_order)
         values ($1, $2, $3, $4, $5)`,
        [certificate.title, certificate.issuerMeta, certificate.verifyUrl, certificate.imageUrl, index + 1],
      );
    }
    if (plan.cv) {
      await query('insert into portfolio_cv (id, file_url, file_name, uploaded_at) values (1, $1, $2, coalesce($3, now()))', [
        cvUrl,
        plan.cv.fileName,
        plan.cv.uploadedAt,
      ]);
    }

    const deleted = plan.retired.length
      ? await query('delete from projects where id = any($1::int[]) returning id', [plan.retired.map((row) => row.id)])
      : [];
    if (dropOld) await query(`drop table if exists ${LEGACY_TABLES.join(', ')}`);

    return {
      projects: projects.length,
      certificates: certificates.length,
      cv: plan.cv ? 1 : 0,
      uploads: uploads(plan).length,
      retiredDeleted: deleted.length,
      droppedOld: dropOld,
    };
  });
}
