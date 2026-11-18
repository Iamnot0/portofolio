# Portfolio real build — design

Status: draft for approval · 2026-11-17

## Intent

Ship the approved prototype (`development/prototype-3d/`) as the production site on
aungkaungkhant.work, with a working admin, a working contact form, and the security
holes of the old site closed. The site positions Clay as a full stack engineer building
enterprise systems and agentic AI workflows.

## Goals

- Public site identical to the approved prototype: running-code hero, fly-through Work,
  gear Founder, shield Certifications, orbit Contact, light/dark themes.
- Admin manages projects, certificates and the CV with real sign-in.
- Contact form delivers to clay.net@proton.me through Resend, reply goes to the visitor.
- Every write endpoint authenticated; no injectable SQL; no script injection.

## Non-goals

- Blog, multi-user admin, analytics dashboards, CMS.
- Redesigning the visuals beyond what the prototype shows.

## Anti-goals (failure even if it works)

- Any secret in the repo or in client JavaScript.
- Pushing to `main` (production) before Clay approves the branch preview.
- Any AI attribution in commits, PRs, code or copy.

## Constraints

- One Vercel project (`portfolio`, team `iamnot0s-projects`) using Services:
  `frontend/` (Vite MPA) and `backend/` (Express, Node 24).
- GitHub `Iamnot0/portofolio` is linked: a push to `main` deploys production.
- Database: Neon Postgres via `DATABASE_URL` (separate dev and prod endpoints).
- Request bodies to functions are capped at 4.5 MB.
- Some networks block outbound Postgres connections on port 5432.

## Approaches considered

| | Approach | Trade-off | Pick |
|---|---|---|---|
| A | Services: Vite frontend + Express backend, one deploy | Atomic deploys, same origin, `vercel dev` runs both | **Chosen (prototype proved it)** |
| B | Two Vercel projects | Independent deploys, but cross-origin and no atomic rollback | No |
| C | Single classic project, `api/` at root | Least work, breaks the folder layout | No |

## Architecture

### Backend (`backend/`, Express)

- `src/app.js` mounts routers under `/api`; JSON body limit 4.5 MB.
- Database access through `@neondatabase/serverless` (HTTPS/WebSockets on 443):
  parameterised by construction, faster cold starts on Vercel, and it works on networks
  that block outbound Postgres on port 5432.
- Input validation with `zod` on every route.
- Routes:
  - Public reads: `GET /api/projects`, `GET /api/certificates`, `GET /api/cv` (published rows only).
  - Auth: `POST /api/auth/login`, `POST /api/auth/logout`, `GET /api/auth/session`.
  - Admin (session required): create/update/delete/reorder projects and certificates,
    replace the CV, issue upload tokens.
  - Contact: `POST /api/contact`.
- Reorder rewrites `display_order` only, in one parameterised statement
  (`UPDATE … FROM unnest($1::int[], $2::int[])`). Primary keys are never renumbered.
- Errors return a generic message; details go to logs only.
- CORS removed: frontend and backend share one origin.

### Auth

- Single admin. `ADMIN_EMAIL` and `ADMIN_PASSWORD_HASH` (scrypt, Node `crypto`) in Vercel
  env as sensitive values. *(Second factor: see decision D2.)*
- Session: signed token (HS256, `jose`) in an `HttpOnly; Secure; SameSite=Strict` cookie,
  8-hour expiry. `SESSION_SECRET` in Vercel env.
- Mutating requests also require a matching `Origin` header.
- Login rate limit: failed attempts counted per IP in Postgres; 5 failures → 15-minute lock.

### Data model (migration `001`)

- `projects`: `id`, `title`, `purpose`, `stack`, `link`, `image_url`, `display_order`,
  `published`, timestamps.
- `certificates`: `id`, `title`, `issuer_meta`, `verify_url`, `image_url`,
  `display_order`, `published`, timestamps.
- `cv`: single current row: `file_url`, `file_name`, `uploaded_at`.
- `login_attempts`, `contact_submissions` (rate limiting and an audit trail).
- Migration moves existing rows across: the four featured projects and three local
  certificates from the prototype are inserted; retired projects handled per decision D3.

### Files *(decision D1)*

- Images and the CV move from base64-in-Postgres to Vercel Blob; rows store URLs.
  Uploads go browser → Blob directly with short-lived tokens issued by the backend
  (avoids the 4.5 MB body limit). Projects API payload drops from ~3.5 MB to a few KB.

### Contact form

- Fields: name, email, company (optional), message. Honeypot field and a minimum
  fill time against bots; 3 submissions per IP per hour.
- Sends the approved template (`backend/src/email/contact-notification.js`) from
  `contact@aungkaungkhant.work` to clay.net@proton.me with `reply_to` = visitor.
- `RESEND_API_KEY`: a new sending-only key restricted to aungkaungkhant.work.
- Wordmark served from `https://aungkaungkhant.work/email/clay-wordmark.png`.

### Frontend (`frontend/`, Vite MPA: `index.html`, `admin.html`)

- Prototype code moves in; data comes from the API (the prototype's local curation
  arrays are deleted after migration).
- Three.js loads after first paint via dynamic import, so text renders immediately.
- Old URLs redirect: `/projects` → `/#work`, `/contact` → `/#contact`, `/dashboard` → `/admin`.
- Security headers in `vercel.json`: CSP, HSTS, `X-Content-Type-Options`,
  `Referrer-Policy`, `frame-ancestors 'none'`.
- SEO: meta description, Open Graph image, `robots.txt`, `sitemap.xml`, Person JSON-LD.
- Admin is `noindex`.

### Development (`development/`)

- `docs/` (this file and the plan), `scripts/` (test email, migrations, password hash),
  `prototype-3d/` (kept until launch, then removed).
- Local run: `vercel dev` from the repo root, against the Development database.

## Delivery

1. Work on branch `redesign`. Each push gets a Vercel preview URL.
2. Clay reviews the preview; production is untouched until approval.
3. Run migration `001` against production, then merge to `main`.

## Decisions (Clay)

- **D1** Image storage: **Vercel Blob** (pending Clay's confirmation after the cost answer).
  Hobby plan includes 1 GB storage, 10 GB transfer, 10K reads and 2K writes per month
  (checked with `vercel pricing blob` on team iamnot0s-projects); current files total ~3 MB.
- **D2** Admin sign-in: **password + authenticator app (TOTP)**. `ADMIN_TOTP_SECRET` in
  Vercel env; enrolment via a one-time script in `development/scripts/` that prints the QR.
- **D3** Retired projects: **delete permanently** (7 rows) in migration `001`.
- **D4** Commit author: **GitHub no-reply** `125693898+Iamnot0@users.noreply.github.com`.

## Left to the builder

File layout inside `backend/src`, exact zod schemas, CSS file split, test runner choice.
