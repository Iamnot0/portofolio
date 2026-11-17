import { HttpError } from '../http.js';

const ORDER_ERROR = 'Order must list every item exactly once';

async function applyOrder(db, ids, { countAll, assignOrder }) {
  await db.transaction(async (query) => {
    const [{ total }] = await query(countAll);
    if (total !== ids.length || new Set(ids).size !== ids.length) throw new HttpError(400, ORDER_ERROR);
    const updated = await query(assignOrder, [ids]);
    if (updated.length !== ids.length) throw new HttpError(400, ORDER_ERROR);
  });
}

export function projectsRepository(db) {
  return {
    listPublished: () =>
      db.query(`
        SELECT id, title, purpose, stack, link, image_url AS "imageUrl"
        FROM portfolio_projects
        WHERE published
        ORDER BY display_order, id`),

    listAll: () =>
      db.query(`
        SELECT id, title, purpose, stack, link, image_url AS "imageUrl",
               published, display_order AS "displayOrder"
        FROM portfolio_projects
        ORDER BY display_order, id`),

    async create({ title, purpose, stack, link, imageUrl, published }) {
      const [row] = await db.query(
        `INSERT INTO portfolio_projects (title, purpose, stack, link, image_url, published, display_order)
         SELECT $1, $2, $3, $4, $5, $6, COALESCE(MAX(display_order), 0) + 1 FROM portfolio_projects
         RETURNING id, title, purpose, stack, link, image_url AS "imageUrl",
                   published, display_order AS "displayOrder"`,
        [title, purpose, stack, link, imageUrl, published],
      );
      return row;
    },

    async update(id, { title, purpose, stack, link, imageUrl, published }) {
      const [row] = await db.query(
        `UPDATE portfolio_projects
         SET title = $2, purpose = $3, stack = $4, link = $5, image_url = $6, published = $7, updated_at = now()
         WHERE id = $1
         RETURNING id, title, purpose, stack, link, image_url AS "imageUrl",
                   published, display_order AS "displayOrder"`,
        [id, title, purpose, stack, link, imageUrl, published],
      );
      return row ?? null;
    },

    async remove(id) {
      const [row] = await db.query(
        'DELETE FROM portfolio_projects WHERE id = $1 RETURNING id, image_url AS "imageUrl"',
        [id],
      );
      return row ?? null;
    },

    reorder: (ids) =>
      applyOrder(db, ids, {
        countAll: 'SELECT count(*)::int AS total FROM portfolio_projects',
        assignOrder: `
          UPDATE portfolio_projects AS t SET display_order = o.pos
          FROM unnest($1::int[]) WITH ORDINALITY AS o(id, pos)
          WHERE t.id = o.id
          RETURNING t.id`,
      }),
  };
}

export function certificatesRepository(db) {
  return {
    listPublished: () =>
      db.query(`
        SELECT id, title, issuer_meta AS "issuerMeta", verify_url AS "verifyUrl", image_url AS "imageUrl"
        FROM portfolio_certificates
        WHERE published
        ORDER BY display_order, id`),

    listAll: () =>
      db.query(`
        SELECT id, title, issuer_meta AS "issuerMeta", verify_url AS "verifyUrl", image_url AS "imageUrl",
               published, display_order AS "displayOrder"
        FROM portfolio_certificates
        ORDER BY display_order, id`),

    async create({ title, issuerMeta, verifyUrl, imageUrl, published }) {
      const [row] = await db.query(
        `INSERT INTO portfolio_certificates (title, issuer_meta, verify_url, image_url, published, display_order)
         SELECT $1, $2, $3, $4, $5, COALESCE(MAX(display_order), 0) + 1 FROM portfolio_certificates
         RETURNING id, title, issuer_meta AS "issuerMeta", verify_url AS "verifyUrl", image_url AS "imageUrl",
                   published, display_order AS "displayOrder"`,
        [title, issuerMeta, verifyUrl, imageUrl, published],
      );
      return row;
    },

    async update(id, { title, issuerMeta, verifyUrl, imageUrl, published }) {
      const [row] = await db.query(
        `UPDATE portfolio_certificates
         SET title = $2, issuer_meta = $3, verify_url = $4, image_url = $5, published = $6, updated_at = now()
         WHERE id = $1
         RETURNING id, title, issuer_meta AS "issuerMeta", verify_url AS "verifyUrl", image_url AS "imageUrl",
                   published, display_order AS "displayOrder"`,
        [id, title, issuerMeta, verifyUrl, imageUrl, published],
      );
      return row ?? null;
    },

    async remove(id) {
      const [row] = await db.query(
        'DELETE FROM portfolio_certificates WHERE id = $1 RETURNING id, image_url AS "imageUrl"',
        [id],
      );
      return row ?? null;
    },

    reorder: (ids) =>
      applyOrder(db, ids, {
        countAll: 'SELECT count(*)::int AS total FROM portfolio_certificates',
        assignOrder: `
          UPDATE portfolio_certificates AS t SET display_order = o.pos
          FROM unnest($1::int[]) WITH ORDINALITY AS o(id, pos)
          WHERE t.id = o.id
          RETURNING t.id`,
      }),
  };
}

export function cvRepository(db) {
  return {
    async get() {
      const [row] = await db.query(
        'SELECT file_url AS "fileUrl", file_name AS "fileName", uploaded_at AS "uploadedAt" FROM portfolio_cv WHERE id = 1',
      );
      return row ?? null;
    },

    // The previous file URL lets the caller delete the superseded Blob.
    async replace({ fileUrl, fileName }) {
      const [{ previousFileUrl, ...cv }] = await db.query(
        `WITH previous AS (SELECT file_url FROM portfolio_cv WHERE id = 1)
         INSERT INTO portfolio_cv (id, file_url, file_name) VALUES (1, $1, $2)
         ON CONFLICT (id) DO UPDATE
           SET file_url = EXCLUDED.file_url, file_name = EXCLUDED.file_name, uploaded_at = now()
         RETURNING file_url AS "fileUrl", file_name AS "fileName", uploaded_at AS "uploadedAt",
                   (SELECT file_url FROM previous) AS "previousFileUrl"`,
        [fileUrl, fileName],
      );
      return { cv, previousFileUrl };
    },
  };
}
