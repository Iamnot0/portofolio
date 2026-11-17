// Recognises file types from their leading bytes. Old uploads were often stored with a wrong or
// generic declared type (application/octet-stream), so the payload is the source of truth.

const SIGNATURES = [
  { type: 'image/jpeg', extension: 'jpg', matches: (b) => b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff },
  {
    type: 'image/png',
    extension: 'png',
    matches: (b) => b.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])),
  },
  {
    type: 'image/webp',
    extension: 'webp',
    matches: (b) => b.subarray(0, 4).toString('latin1') === 'RIFF' && b.subarray(8, 12).toString('latin1') === 'WEBP',
  },
  { type: 'image/gif', extension: 'gif', matches: (b) => b.subarray(0, 4).toString('latin1') === 'GIF8' },
  { type: 'application/pdf', extension: 'pdf', matches: (b) => b.subarray(0, 5).toString('latin1') === '%PDF-' },
];

export function sniffFile(bytes) {
  const match = SIGNATURES.find((signature) => signature.matches(bytes));
  return match ? { contentType: match.type, extension: match.extension } : null;
}

export const isImage = (file) => file?.contentType.startsWith('image/') ?? false;

export function decodeDataUrl(value) {
  const match = /^data:[^,]*;base64,(.*)$/s.exec(typeof value === 'string' ? value : '');
  return match ? Buffer.from(match[1], 'base64') : null;
}

export function slugify(text) {
  return text
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}
