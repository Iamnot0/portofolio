import { PGlite } from '@electric-sql/pglite';

// Statements without parameters go through exec so multi-statement migration files run, which
// mirrors Neon's pooled client (simple protocol when there are no parameters).
const run = (client) => async (text, params = []) => {
  if (params.length) return (await client.query(text, params)).rows;
  const results = await client.exec(text);
  return results.at(-1)?.rows ?? [];
};

export function createTestDb() {
  const pg = new PGlite();
  return {
    query: run(pg),
    transaction: (fn) => pg.transaction((tx) => fn(run(tx))),
    close: () => pg.close(),
  };
}

// Stands in for Vercel Blob's `put`: records every call and answers with a deterministic URL.
export function fakeBlob() {
  const puts = [];
  const put = async (pathname, data, options) => {
    puts.push({ pathname, data, options });
    return { url: `https://store.public.blob.vercel-storage.com/${pathname}` };
  };
  put.puts = puts;
  return put;
}

export const LEGACY_SCHEMA = `
  create table projects (
    id serial primary key, title text, description text, image_label text,
    button_text text, link text, image text, display_order int
  );
  create table certificates (
    id serial primary key, title text, image text, file_type text,
    is_pdf boolean, display_order int, created_at timestamptz
  );
  create table cv_files (
    id serial primary key, file_name text, file_data text, file_type text, uploaded_at timestamptz
  );
`;

// Smallest byte sequences each magic-number check recognises, as base64.
export const IMAGE_BYTES = {
  jpeg: Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10, 0x4a, 0x46]),
  png: Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00]),
  webp: Buffer.concat([Buffer.from('RIFF'), Buffer.from([4, 0, 0, 0]), Buffer.from('WEBPVP8 ')]),
  pdf: Buffer.from('%PDF-1.7\n%%EOF'),
};

export const dataUrl = (mime, bytes) => `data:${mime};base64,${bytes.toString('base64')}`;
