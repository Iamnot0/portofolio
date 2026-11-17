const MAX_BYTES = 4 * 1024 * 1024;
const IMAGE_EXTENSIONS = { 'image/png': 'png', 'image/jpeg': 'jpg', 'image/webp': 'webp' };

export const IMAGE_TOO_LARGE = 'Images must be 4 MB or smaller.';
export const IMAGE_WRONG_TYPE = 'Images must be PNG, JPEG or WebP.';
export const CV_REJECTED = 'The CV must be a PDF up to 4 MB.';

export function checkImage(file) {
  if (!(file.type in IMAGE_EXTENSIONS)) return IMAGE_WRONG_TYPE;
  return file.size > MAX_BYTES ? IMAGE_TOO_LARGE : null;
}

export function checkCv(file) {
  return file.type === 'application/pdf' && file.size <= MAX_BYTES ? null : CV_REJECTED;
}

function slugify(text) {
  return text
    .normalize('NFKD')
    .replace(/\p{M}/gu, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 60)
    .replace(/-+$/, '');
}

// Images are named after the item title, the CV after its file name. The server adds a random suffix.
export function uploadPathname(folder, title, file) {
  if (folder === 'cv') {
    return `cv/${slugify(file.name.replace(/\.[^.]*$/, '')) || 'cv'}.pdf`;
  }
  return `${folder}/${slugify(title) || 'image'}.${IMAGE_EXTENSIONS[file.type]}`;
}
