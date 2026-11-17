# Portfolio Real Build Implementation Plan

**Goal:** Ship the approved 3D prototype as aungkaungkhant.work with a secure admin, Blob-backed media and a working contact form, delivered as a Vercel preview on branch `redesign`.

**Architecture:** One Vercel project with Services: `frontend/` (Vite MPA: `index.html`, `admin.html`) and `backend/` (Express 5, ESM). The backend talks to Neon through `@neondatabase/serverless` behind a two-method db adapter, so tests run the same SQL against in-process PGlite. Media lives in Vercel Blob (browser uploads with backend-issued tokens); email goes through Resend's HTTP API.

**Tech Stack:** Node 24, Express 5.3, @neondatabase/serverless 1.2, zod 4.6, jose 6.2, otpauth 9.6, @vercel/blob 2.9, Vite 8, three 0.187, gsap 3.15, lenis 1.3; tests: `node:test` + @electric-sql/pglite 0.5.

**Spec:** `development/docs/2026-11-17-real-build-design.md`

## Global Constraints

- Node `24.x` in every `package.json` `engines`; backend `"type": "module"`.
- All SQL parameterised; no string-built SQL anywhere.
- Secrets only in Vercel env (sensitive): `DATABASE_URL`, `SESSION_SECRET`, `ADMIN_EMAIL`, `ADMIN_PASSWORD_HASH`, `ADMIN_TOTP_SECRET`, `RESEND_API_KEY`, `BLOB_READ_WRITE_TOKEN`. Non-secret: `CONTACT_TO=clay.net@proton.me`, `CONTACT_FROM=Clay <contact@aungkaungkhant.work>`.
- Session cookie `clay_session`: `HttpOnly; Secure; SameSite=Strict; Path=/; Max-Age=28800`.
- Upload limits: images `image/png|jpeg|webp` ≤ 4 MB; CV `application/pdf` ≤ 4 MB.
- Copy rules: no em/en dashes, no resting underlines, enterprise positioning (see design doc).
- Git: branch `redesign`; author `CLAY <125693898+Iamnot0@users.noreply.github.com>`; no AI attribution in any commit, file or comment; never push `main`.
- No secret or old credential (the old site's hardcoded admin password, the Neon URL) may enter git history: old files are deleted before the first commit.

## Review Focus

1. Visitor text containing HTML or script in any contact field → shown as literal text in the email, never markup (Task 6 test).
2. Admin session expires mid-edit → API answers 401, admin returns to sign-in with "Your session ended. Sign in again." and no silent data loss (Task 9 test).
3. Upload over 4 MB or of the wrong type → token refused, admin shows the limit (Tasks 5, 9 tests).
4. API or database unavailable → public site still renders hero, experience, founder and contact with stated empty states, never a blank page (Task 8 test).
5. Reorder payload with non-integer, duplicate or unknown ids → 400 and no rows change (Task 4 test).

---

## File Structure

```
backend/
  package.json                 ESM, deps, "test": "node --test"
  src/app.js                   createApp({ db, blob, mailer, env, clock }) → Express app
  src/index.js                 production wiring: default export app (Vercel entrypoint)
  src/db.js                    createNeonDb(url) / adapter shape { query, transaction }
  src/http.js                  asyncRoute(), HttpError, error handler, origin guard
  src/auth/password.js         hashPassword(), verifyPassword()  (scrypt)
  src/auth/totp.js             verifyTotp(secret, code, now)
  src/auth/session.js          issueSession(), readSession(), requireAdmin
  src/auth/routes.js           /api/auth/login|logout|session
  src/auth/rate-limit.js       recordFailure(), isLocked(), allowAttempt()
  src/content/schemas.js       zod schemas for projects, certificates, cv, reorder
  src/content/repository.js    SQL for projects, certificates, cv
  src/content/routes.js        public reads + admin writes
  src/uploads/routes.js        /api/uploads (Blob client-upload token handler)
  src/contact/routes.js        /api/contact
  src/email/contact-notification.js   (exists) → convert to ESM
  src/email/resend.js          createResendMailer(apiKey)
  db/migrations/001_portfolio.sql
  test/helpers.js              createTestDb() (PGlite + migrations), testApp()
  test/*.test.js
frontend/                      replaced by development/prototype-3d contents
  index.html, admin.html, vite.config.js, package.json
  public/ (favicons, email/clay-wordmark.png, robots.txt, sitemap.xml, og.png)
  src/ main.js scene.js formations.js flythrough.js content.js data.js admin.js
       contact.js api.js style.css admin.css
development/
  README.md                    local run, scripts, env
  scripts/migrate.js           runs db/migrations against DATABASE_URL
  scripts/migrate-content.js   one-time: old tables → new tables + Blob, deletes retired
  scripts/admin-credentials.js prints ADMIN_PASSWORD_HASH and TOTP secret + QR
  scripts/send-test-email.js   (exists) → ESM
vercel.json                    services, rewrites, redirects, security headers
```

---

### Task 1: Repository hygiene and branch

**Files:**
- Delete: `frontend/*` (old site, contains a hardcoded admin password), `backend/src/handlers/*`, `development/ADMIN_README.md`, `development/QUICKSTART.md`
- Create: `development/README.md`
- Modify: `.gitignore` (add `.playwright-mcp/`, `development/prototype-3d/dist/`)

- [ ] **Step 1:** `git checkout -b redesign`; set repo-local `user.name "CLAY"`, `user.email "125693898+Iamnot0@users.noreply.github.com"`.
- [ ] **Step 2:** Delete the files above; `development/README.md` covers: `vercel dev` from repo root, the scripts in `development/scripts/`, required env names (Global Constraints).
- [ ] **Step 3: Verify no secrets are staged**
  Run: `git diff --cached --name-only | xargs -r grep -l -E 'ADMIN_CREDENTIALS|npg_[A-Za-z0-9]|re_[A-Za-z0-9_]{20,}'`
  Expected: no file names printed.
- [ ] **Step 4:** Commit is deferred to Task 2 (nothing runnable yet).

### Task 2: Backend foundation (ESM, db adapter, schema, test harness)

**Files:**
- Modify: `backend/package.json`, `backend/src/email/contact-notification.js` (→ ESM `export`)
- Create: `backend/src/app.js`, `backend/src/index.js`, `backend/src/db.js`, `backend/src/http.js`, `backend/db/migrations/001_portfolio.sql`, `backend/test/helpers.js`, `backend/test/health.test.js`
- Modify: `vercel.json` (backend `entrypoint` → `src/index.js`)

**Interfaces:**
- Produces: `createApp({ db, blob, mailer, env, clock }): express.Application`; `db = { query(text: string, params?: unknown[]): Promise<Row[]>, transaction(fn: (q) => Promise<T>): Promise<T> }`; `createNeonDb(url): Db`; `createTestDb(): Promise<Db>` (fresh PGlite with 001 applied); `HttpError(status, message)`; `asyncRoute(fn)`.

Schema `001_portfolio.sql` (new tables alongside the old ones; Task 7 migrates and drops old):
- `portfolio_projects(id serial pk, title text not null, purpose text not null default '', stack text not null default '', link text, image_url text, display_order int not null, published boolean not null default true, created_at timestamptz default now(), updated_at timestamptz default now())`
- `portfolio_certificates(id serial pk, title text not null, issuer_meta text not null default '', verify_url text, image_url text, display_order int not null, published boolean not null default true, created_at…, updated_at…)`
- `portfolio_cv(id int pk check (id = 1), file_url text not null, file_name text not null, uploaded_at timestamptz not null default now())`
- `login_attempts(ip text, attempted_at timestamptz default now())`, `contact_submissions(id serial pk, ip text, name text, email text, company text, message text, created_at timestamptz default now())`, indexes on `(ip, attempted_at)` and `(ip, created_at)`.

- [ ] **Step 1: Failing test** `health.test.js`: `GET /api/health` → `200 { ok: true }`; `GET /api/nope` → `404 { error: 'Not found' }`; a route throwing a plain `Error` → `500 { error: 'Something went wrong' }` (no message leak).
- [ ] **Step 2:** Run `npm test --prefix backend` → FAIL (module missing).
- [ ] **Step 3:** Implement; `express.json({ limit: '4.5mb' })`; no CORS middleware; `x-powered-by` disabled.
- [ ] **Step 4:** Run `npm test --prefix backend` → PASS.
- [ ] **Step 5:** Commit `feat(backend): ESM foundation, db adapter and schema`.

### Task 3: Admin authentication (password + TOTP + session)

**Files:**
- Create: `backend/src/auth/{password,totp,session,routes,rate-limit}.js`, `backend/test/auth.test.js`

**Interfaces:**
- Consumes: `db`, `env`, `clock` from Task 2.
- Produces: `hashPassword(pw): Promise<string>` → `scrypt$16384$8$1$<saltB64>$<hashB64>`; `verifyPassword(pw, stored): Promise<boolean>` (timing-safe); `verifyTotp(secret, code, now): boolean` (SHA1, 6 digits, 30 s, window ±1); `requireAdmin` middleware (401 `{ error: 'Sign in required' }`); routes `POST /api/auth/login {email,password,code}`, `POST /api/auth/logout`, `GET /api/auth/session` → `{ signedIn: boolean }`.

- [ ] **Step 1: Failing tests:** correct email+password+code → 200 and `Set-Cookie` containing `clay_session=`, `HttpOnly`, `Secure`, `SameSite=Strict`; wrong password → 401 `{ error: 'Email, password or code is incorrect' }` (same message for each wrong field); valid credentials with code from 2 steps ago → 401; 5 failures from one IP → 6th attempt 429 `{ error: 'Too many attempts. Try again in 15 minutes.' }` even with correct credentials; session cookie expired (clock + 8 h + 1 s) → `GET /api/auth/session` `{ signedIn: false }`; `POST` with `Origin: https://evil.example` → 403.
- [ ] **Step 2:** Run → FAIL.
- [ ] **Step 3:** Implement with `node:crypto` scrypt, `otpauth` TOTP, `jose` HS256 (`SESSION_SECRET`); origin guard on all non-GET `/api/*` except `/api/contact` allows only the request's own origin.
- [ ] **Step 4:** Run → PASS.
- [ ] **Step 5:** Commit `feat(backend): admin sign-in with password, TOTP and signed session`.

### Task 4: Content API

**Files:**
- Create: `backend/src/content/{schemas,repository,routes}.js`, `backend/test/content.test.js`

**Interfaces:**
- Produces (JSON shapes the frontend uses):
  - `GET /api/projects` → `[{ id, title, purpose, stack, link, imageUrl }]` published, by `display_order`.
  - `GET /api/certificates` → `[{ id, title, issuerMeta, verifyUrl, imageUrl }]`.
  - `GET /api/cv` → `{ fileUrl, fileName, uploadedAt } | null`.
  - Admin (requireAdmin): `GET /api/admin/projects` (all incl. unpublished), `POST /api/admin/projects`, `PUT /api/admin/projects/:id`, `DELETE /api/admin/projects/:id`, `PUT /api/admin/projects/order { ids: number[] }`; same five for `/api/admin/certificates`; `PUT /api/admin/cv { fileUrl, fileName }`.
- Validation: `title` 1–120 chars; `link`/`verifyUrl` must be `https:` (or null); `imageUrl`/`fileUrl` must be on the Blob store host (`*.public.blob.vercel-storage.com`) or null.

- [ ] **Step 1: Failing tests:** public lists exclude unpublished and follow `display_order`; admin routes without cookie → 401; create with `link: 'javascript:alert(1)'` → 400; reorder `{ ids: [2, 1] }` swaps order; reorder `{ ids: ['1; drop table x', 2] }` → 400; reorder with a duplicate or unknown id → 400 and orders unchanged; delete → 204 and returns the removed row's `imageUrl` to the caller for Blob cleanup (Task 5).
- [ ] **Step 2:** Run → FAIL.
- [ ] **Step 3:** Implement; reorder in one statement `UPDATE … SET display_order = o.pos FROM unnest($1::int[]) WITH ORDINALITY AS o(id, pos) WHERE …`, inside `db.transaction` with a count check.
- [ ] **Step 4:** Run → PASS.
- [ ] **Step 5:** Commit `feat(backend): content API with validated, parameterised queries`.

### Task 5: Blob uploads

**Files:**
- Create: `backend/src/uploads/routes.js`, `backend/test/uploads.test.js`
- Modify: `backend/src/content/routes.js` (delete/replace → `blob.del(oldUrl)`)

**Interfaces:**
- Consumes: `blob = { handleUpload(req, body, options), del(url) }` injected (production: `@vercel/blob/client` `handleUpload`, `@vercel/blob` `del`).
- Produces: `POST /api/uploads` (requireAdmin) accepting the `@vercel/blob/client` `upload()` protocol; `clientPayload` = `'image' | 'cv'` selects `allowedContentTypes` and `maximumSizeInBytes: 4 * 1024 * 1024`; pathnames `projects/`, `certificates/`, `cv/` with random suffix.

- [ ] **Step 1: Failing tests:** without session → 401; token options for `'image'` allow only png/jpeg/webp and 4 MB; for `'cv'` only `application/pdf`; deleting a project calls `blob.del` with its `imageUrl`.
- [ ] **Step 2–4:** FAIL → implement → PASS.
- [ ] **Step 5:** Commit `feat(backend): Blob client uploads for images and CV`.

### Task 6: Contact form endpoint

**Files:**
- Create: `backend/src/contact/routes.js`, `backend/src/email/resend.js`, `backend/test/contact.test.js`

**Interfaces:**
- Consumes: `renderContactNotification(submission, logoSrc)` (exists); `mailer = { send({ from, to, replyTo, subject, html, text }): Promise<{ id }> }`.
- Produces: `POST /api/contact { name, email, company?, message, website, startedAt }` → `202 { ok: true }`. `website` is the honeypot (non-empty → 202, nothing sent); `startedAt` older than now − 3 s required (faster → 202, nothing sent); limits name 120, email 254 (valid), company 120, message 10–5000.
- Logo URL: `https://www.aungkaungkhant.work/email/clay-wordmark.png`.

- [ ] **Step 1: Failing tests:** valid → 202 and `mailer.send` called with `replyTo` = visitor email, `to` = `CONTACT_TO`; message `<script>alert(1)</script>` → html contains `&lt;script&gt;` and no `<script>`; honeypot filled → 202, mailer not called; 4th submission from one IP within an hour → 429 `{ error: 'Too many messages. Try again later.' }`; mailer throws → 502 `{ error: 'Message could not be sent. Email clay.net@proton.me directly.' }` and the submission is still stored.
- [ ] **Step 2–4:** FAIL → implement (`fetch` to `https://api.resend.com/emails`) → PASS.
- [ ] **Step 5:** Commit `feat(backend): contact form with Resend delivery and abuse limits`.

### Task 7: Operational scripts

**Files:**
- Create: `development/package.json` (deps: `@neondatabase/serverless`, `@vercel/blob`, `qrcode`), `development/scripts/{migrate,migrate-content,admin-credentials}.js`
- Modify: `development/scripts/send-test-email.js` (ESM)

**Interfaces:**
- `migrate.js`: applies `backend/db/migrations/*.sql` in order, recording them in `schema_migrations(name text pk, applied_at)`; idempotent.
- `migrate-content.js --dry-run|--apply`: inserts the 4 featured projects and 3 local certificates from `development/prototype-3d/src/data.js`; copies kept old `projects` row (Pae Ka Yauk) and old `certificates` rows into new tables, uploading their base64 images (MIME sniffed) and the old CV PDF to Blob; deletes the 7 retired projects; drops old tables `projects`, `certificates`, `cv_files` only with `--apply`; prints a row-count summary.
- `admin-credentials.js`: prompts for password (hidden), prints `ADMIN_PASSWORD_HASH`, a new `ADMIN_TOTP_SECRET` and a terminal QR of the `otpauth://` URI (issuer `aungkaungkhant.work`, label `admin`).

- [ ] **Step 1:** Implement `migrate.js` and run against PGlite path used by tests: `node development/scripts/migrate.js` with `DATABASE_URL` of the Development DB → prints `applied 001_portfolio.sql`; second run prints `up to date`.
- [ ] **Step 2:** `migrate-content.js --dry-run` against Development DB → prints planned inserts/uploads/deletes, changes nothing (verify counts unchanged).
- [ ] **Step 3:** Commit `chore(development): migration, content move and admin credential scripts`.

### Task 8: Public frontend

**Files:**
- Create: `frontend/` from `development/prototype-3d/` (`index.html`, `admin.html`, `vite.config.js`, `package.json`, `public/`, `src/`); `frontend/src/api.js`; `frontend/src/contact.js`; `frontend/public/{robots.txt,sitemap.xml,og.png}`
- Modify: `frontend/src/data.js` (fetch same-origin `/api/*`, new JSON shapes, delete local curation arrays), `frontend/src/main.js` (dynamic `import('./scene.js')` after first paint), `frontend/index.html` (contact form, OG/Twitter meta, Person JSON-LD), `vercel.json` (redirects, headers)
- Test: `frontend/test/data.test.js` (`node --test` with stubbed `fetch`)

**Interfaces:**
- Consumes: Task 4 JSON shapes.
- Produces: `api.js`: `apiGet(path)`, `apiSend(method, path, body)` → throws `ApiError { status, message }`; `data.js`: `getProjects()`, `getCertificates()`, `getCV()` returning `[]`/`null` on failure.
- Contact form fields: Name, Email, Company (optional), Message; success text "Thanks. Your message is on its way."; error text from API.
- `vercel.json`: redirects `/projects`→`/#work`, `/contact`→`/#contact`, `/dashboard`→`/admin` (308); headers: `Content-Security-Policy` (self; fonts.googleapis.com, fonts.gstatic.com; img self data: blob store host; connect self + blob API), `Strict-Transport-Security: max-age=63072000; includeSubDomains; preload`, `X-Content-Type-Options: nosniff`, `Referrer-Policy: strict-origin-when-cross-origin`, `Permissions-Policy: camera=(), microphone=(), geolocation=()`, `frame-ancestors 'none'`; `/admin` `X-Robots-Tag: noindex`.

- [ ] **Step 1: Failing tests:** `getProjects()` with `fetch` rejecting → `[]`; with 500 → `[]`; maps `imageUrl` → `image`.
- [ ] **Step 2–4:** FAIL → implement → PASS (`npm test --prefix frontend`).
- [ ] **Step 5: Verify build and page with API down:** `npm run build --prefix frontend` passes; `vite preview` with no backend → hero, experience, founder, contact render, Work shows "Projects are loading slowly. Refresh to try again." (no blank sections).
- [ ] **Step 6:** Commit `feat(frontend): ship 3D portfolio on the real API with contact form`.

### Task 9: Admin wired to the API

**Files:**
- Modify: `frontend/admin.html` (TOTP field "Authenticator code", remove preview banner), `frontend/src/admin.js`
- Test: `frontend/test/admin-session.test.js`

**Interfaces:**
- Consumes: Task 3 auth routes, Task 4 admin routes, Task 5 `/api/uploads` via `upload()` from `@vercel/blob/client` (`handleUploadUrl: '/api/uploads'`, `clientPayload: 'image' | 'cv'`).
- Behaviour: on load `GET /api/auth/session`; any 401 → sign-in view with "Your session ended. Sign in again."; uploads > 4 MB rejected before upload with "Images must be 4 MB or smaller." / "The CV must be a PDF up to 4 MB."; reorder (drag or ↑↓) sends `PUT …/order` and reverts the list if it fails.

- [ ] **Step 1: Failing test:** `handleApiError(new ApiError(401))` switches to sign-in with the session message; non-401 shows a toast with the API message.
- [ ] **Step 2–4:** FAIL → implement → PASS.
- [ ] **Step 5: Verify against `vercel dev`** with Development DB and test credentials: sign in with code, add/edit/reorder/delete a project, replace CV, sign out.
- [ ] **Step 6:** Commit `feat(admin): real sign-in, content editing and Blob uploads`.

### Task 10: Provision, preview deploy

- [ ] **Step 1:** Create public Blob store `portfolio-media` and connect it to project `portfolio` (all environments).
- [ ] **Step 2:** Create a Resend sending-only API key restricted to aungkaungkhant.work; set `RESEND_API_KEY` (sensitive) for Preview and Production.
- [ ] **Step 3:** Run `admin-credentials.js` with Clay at the keyboard; set `ADMIN_EMAIL`, `ADMIN_PASSWORD_HASH`, `ADMIN_TOTP_SECRET`, `SESSION_SECRET` (`openssl rand -base64 48`), `CONTACT_TO`, `CONTACT_FROM` for Development, Preview, Production; add `DATABASE_URL` for Preview pointing at the Development database.
- [ ] **Step 4:** Run `migrate.js` then `migrate-content.js --apply` against the **Development** database only.
- [ ] **Step 5: Verify locally:** `npm test --prefix backend`, `npm test --prefix frontend`, `vercel build` → all pass.
- [ ] **Step 6:** Push `redesign`; open the Vercel preview URL; walk the site, the admin and a real contact submission.
- [ ] **Step 7:** Stop. Production migration and merge to `main` happen only after Clay approves the preview.
