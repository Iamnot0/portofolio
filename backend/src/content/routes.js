import { Router } from 'express';
import { HttpError, asyncRoute } from '../http.js';
import { requireAdmin } from '../auth/session.js';
import { certificatesRepository, cvRepository, projectsRepository } from './repository.js';
import { certificateSchema, cvSchema, orderSchema, parseBody, projectSchema } from './schemas.js';

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
  const { db } = ctx;
  const router = Router();
  router.use(requireAdmin(ctx));

  const collection = (path, repository, schema) => {
    router.get(path, asyncRoute(async (req, res) => res.json(await repository.listAll())));

    router.post(path, asyncRoute(async (req, res) => {
      res.status(201).json(await repository.create(parseBody(schema, req.body)));
    }));

    // Registered before `/:id` so "order" is never read as an id.
    router.put(`${path}/order`, asyncRoute(async (req, res) => {
      await repository.reorder(parseBody(orderSchema, req.body).ids);
      res.status(204).end();
    }));

    router.put(`${path}/:id`, asyncRoute(async (req, res) => {
      const id = idParam(req);
      const row = await repository.update(id, parseBody(schema, req.body));
      if (!row) throw new HttpError(404, 'Not found');
      res.json(row);
    }));

    router.delete(`${path}/:id`, asyncRoute(async (req, res) => {
      const removed = await repository.remove(idParam(req));
      if (!removed) throw new HttpError(404, 'Not found');
      res.status(204).end();
    }));
  };

  collection('/projects', projectsRepository(db), projectSchema);
  collection('/certificates', certificatesRepository(db), certificateSchema);

  const cv = cvRepository(db);
  router.put('/cv', asyncRoute(async (req, res) => {
    const { cv: current } = await cv.replace(parseBody(cvSchema, req.body));
    res.json(current);
  }));

  return router;
}
