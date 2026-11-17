# Development

One Vercel project, two services: `frontend/` (Vite) and `backend/` (Express 5, ESM). The frontend and the API share one origin; `/api/*` routes to the backend.

## Run locally

From the repository root:

```bash
npm install --prefix backend
npm install --prefix frontend
vercel dev
```

Tests run in-process against PGlite and need no database or network:

```bash
npm test --prefix backend
npm test --prefix development
```

## Environment

Secrets live in Vercel environment variables (mark them sensitive) and never in git. For local runs, pull them with `vercel env pull`.

| Name | Purpose |
| --- | --- |
| `DATABASE_URL` | Neon connection string |
| `SESSION_SECRET` | Signs the admin session cookie |
| `ADMIN_EMAIL` | Admin sign-in address |
| `ADMIN_PASSWORD_HASH` | scrypt hash of the admin password |
| `ADMIN_TOTP_SECRET` | Base32 secret for the authenticator code |
| `RESEND_API_KEY` | Sends contact notifications |
| `BLOB_READ_WRITE_TOKEN` | Vercel Blob uploads |
| `CONTACT_TO` | Contact notification recipient |
| `CONTACT_FROM` | Contact notification sender |

## Scripts

Scripts in `development/scripts/` run from the repository root after `npm install --prefix development`. Pull the environment first with `vercel env pull` so `DATABASE_URL` and `BLOB_READ_WRITE_TOKEN` are available (`set -a; . ./.env.local; set +a`).

### `migrate.js`

Applies each `backend/db/migrations/*.sql` file not yet recorded in `schema_migrations`, in filename order, one transaction per file. Prints `applied <file>` per file, or `up to date`.

```bash
node development/scripts/migrate.js
```

### `migrate-content.js`

One-time move of the old `projects`, `certificates` and `cv_files` tables into `portfolio_projects`, `portfolio_certificates` and `portfolio_cv`, with images and the newest CV uploaded to Vercel Blob. Seeds the four featured projects and three local certificates from `scripts/seed-content.js`, deletes the seven retired projects from the old table, and keeps every other old row.

```bash
node development/scripts/migrate-content.js --dry-run
node development/scripts/migrate-content.js --apply
node development/scripts/migrate-content.js --apply --drop-old
```

- `--dry-run` prints the plan (rows, uploads, retired rows) and changes nothing.
- `--apply` uploads to Blob, then writes all rows and deletes the retired projects in one transaction. It exits with an error if any `portfolio_*` content table already has rows.
- `--drop-old` also drops `projects`, `certificates` and `cv_files`. This cannot be undone, so run it only after checking the result.

Run `migrate.js` first. Uploaded files are not removed if a later database write fails.

### `admin-credentials.js`

Asks for the admin password twice without echo (12 characters minimum), then prints `ADMIN_PASSWORD_HASH`, a new `ADMIN_TOTP_SECRET` and a QR code for the authenticator app. Needs a real terminal.

```bash
node development/scripts/admin-credentials.js
```

Paste the two values into the Vercel dashboard. The hash contains `$`, so do not pass it through an unquoted shell.

### `send-test-email.js`

Sends a sample contact notification through Resend to check the template in a real inbox.

```bash
RESEND_API_KEY=... node development/scripts/send-test-email.js recipient@example.com
```
