<p align="center">
  <a href="https://aungkaungkhant.work">
    <picture>
      <source media="(prefers-color-scheme: dark)" srcset=".github/assets/clay-wordmark-dark.png">
      <img src=".github/assets/clay-wordmark-light.png" alt="Clay" width="180">
    </picture>
  </a>
</p>

<p align="center">
  Portfolio of <strong>Aung Kaung Khant (Clay)</strong>, Founder and CEO of Optimus Technica (MRROBOT).<br>
  <a href="https://aungkaungkhant.work">aungkaungkhant.work</a>
</p>

## Overview

A portfolio site with routed sections (experience, work, founder, certifications, contact), a Three.js scene, and a private admin area for managing projects, certifications and the CV.

## Stack

| Layer    | Technology                                                    |
| -------- | ------------------------------------------------------------- |
| Frontend | Vite multi-page app, Three.js, GSAP, Lenis                    |
| Backend  | Express 5 (ESM) on Node 24                                    |
| Data     | Neon Postgres; Vercel Blob for media                          |
| Email    | Resend, for contact notifications                             |
| Hosting  | Vercel Services: frontend and backend ship as one deployment  |

## Structure

```
frontend/     site, admin area and static assets
backend/      API: content, admin sign-in, uploads, contact
vercel.json   services and routing
```

## Run the frontend locally

```bash
npm install --prefix frontend
npm run dev --prefix frontend
```

The backend needs its database and service credentials, which live in Vercel and are never committed.

## License

MIT. See [LICENSE](LICENSE).
