import { Router } from 'express';
import { HttpError, asyncRoute } from '../http.js';
import { requireAdmin } from '../auth/session.js';
import { certificatesRepository, cvRepository, projectsRepository } from './repository.js';
import {
  certificateCreateSchema,
  certificateUpdateSchema,
  cvSchema,
  orderSchema,
  parseBody,
  projectCreateSchema,
  projectUpdateSchema,
} from './schemas.js';

const MAX_ID = 2_147_483_647;

function idParam(req) {
  const id = /^\d+$/.test(req.params.id) ? Number(req.params.id) : 0;
  if (id < 1 || id > MAX_ID) throw new HttpError(404, 'Not found');
  return id;
}

export function publicContentRouter({ db }) {
  const projects = projectsRepository(db);
  const certificates = certificatesRepository(db);
  const cv = cvRepository(db);
  const router = Router();

  router.get('/projects', asyncRoute(async (req, res) => res.json(await projects.listPublished())));
  router.get('/certificates', asyncRoute(async (req, res) => res.json(await certificates.listPublished())));
  router.get('/cv', asyncRoute(async (req, res) => res.json(await cv.get())));

  return router;
}

export function adminContentRouter(ctx) {
  const { db, blob } = ctx;
  const router = Router();
  router.use(requireAdmin(ctx));

  // Storage cleanup never fails the request: the row is already saved, and a leftover Blob only costs space.
  const discardBlob = async (url) => {
    if (!url) return;
    try {
      await blob.del(url);
    } catch (error) {
      console.error(`Blob cleanup failed for ${url}`, error);
    }
  };

  const collection = (path, repository, { createSchema, updateSchema }) => {
    router.get(path, asyncRoute(async (req, res) => res.json(await repository.listAll())));

    router.post(path, asyncRoute(async (req, res) => {
      res.status(201).json(await repository.create(parseBody(createSchema, req.body)));
    }));

    // Registered before `/:id` so "order" is never read as an id.
    router.put(`${path}/order`, asyncRoute(async (req, res) => {
      await repository.reorder(parseBody(orderSchema, req.body).ids);
      res.status(204).end();
    }));

    router.put(`${path}/:id`, asyncRoute(async (req, res) => {
      const id = idParam(req);
      const updated = await repository.update(id, parseBody(updateSchema, req.body));
      if (!updated) throw new HttpError(404, 'Not found');
      const { row, previousImageUrl } = updated;
      if (previousImageUrl !== row.imageUrl) await discardBlob(previousImageUrl);
      res.json(row);
    }));

    router.delete(`${path}/:id`, asyncRoute(async (req, res) => {
      const removed = await repository.remove(idParam(req));
      if (!removed) throw new HttpError(404, 'Not found');
      await discardBlob(removed.imageUrl);
      res.status(204).end();
    }));
  };

  collection('/projects', projectsRepository(db), {
    createSchema: projectCreateSchema,
    updateSchema: projectUpdateSchema,
  });
  collection('/certificates', certificatesRepository(db), {
    createSchema: certificateCreateSchema,
    updateSchema: certificateUpdateSchema,
  });

  const cv = cvRepository(db);
  router.put('/cv', asyncRoute(async (req, res) => {
    const { cv: current, previousFileUrl } = await cv.replace(parseBody(cvSchema, req.body));
    if (previousFileUrl !== current.fileUrl) await discardBlob(previousFileUrl);
    res.json(current);
  }));

  return router;
}
