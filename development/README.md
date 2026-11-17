# Development

One Vercel project, two services: `frontend/` (Vite) and `backend/` (Express 5, ESM). The frontend and the API share one origin; `/api/*` routes to the backend.

## Run locally

From the repository root:

```bash
npm install --prefix backend
npm install --prefix frontend
vercel dev
```

Backend tests run in-process against PGlite and need no database or network:

```bash
npm test --prefix backend
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

Scripts in `development/scripts/` run from the repository root.

- `send-test-email.js`: sends a sample contact notification through Resend to check the template in a real inbox.
  `RESEND_API_KEY=... node development/scripts/send-test-email.js recipient@example.com`
