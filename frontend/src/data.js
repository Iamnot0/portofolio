// Portfolio content shared by the public site and the admin dashboard.
import { apiGet } from './api.js';

export function el(tag, { className, text, attrs } = {}, children = []) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text != null) node.textContent = text;
  if (attrs) for (const [key, value] of Object.entries(attrs)) node.setAttribute(key, value);
  for (const child of children) if (child) node.append(child);
  return node;
}

// Every URL that reaches an href or src passes through here, whatever the API returned.
export function publicLink(href) {
  try {
    const url = new URL(href);
    return url.protocol === 'https:' ? url.href : null;
  } catch {
    return null;
  }
}

export function hostname(href) {
  return href ? new URL(href).hostname : '';
}

async function getList(path) {
  try {
    const rows = await apiGet(path);
    return Array.isArray(rows) ? rows : [];
  } catch {
    return [];
  }
}

export async function getProjects() {
  const rows = await getList('/api/projects');
  return rows.map((row) => ({
    title: row.title.trim(),
    purpose: row.purpose?.trim() ?? '',
    stack: row.stack?.trim() ?? '',
    link: publicLink(row.link),
    image: publicLink(row.imageUrl),
  }));
}

export async function getCertificates() {
  const rows = await getList('/api/certificates');
  return rows.map((row) => ({
    title: row.title.trim(),
    meta: row.issuerMeta?.trim() ?? '',
    image: publicLink(row.imageUrl),
    verify: publicLink(row.verifyUrl),
  }));
}

export async function getCV() {
  try {
    const cv = await apiGet('/api/cv');
    const fileUrl = publicLink(cv?.fileUrl);
    return fileUrl ? { fileUrl, fileName: cv.fileName, uploadedAt: cv.uploadedAt } : null;
  } catch {
    return null;
  }
}
