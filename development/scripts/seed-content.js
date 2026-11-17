// Curated portfolio content from the approved prototype (prototype-3d/src/data.js), which cannot be
// imported here because it reads Vite's `import.meta.env`. Images are relative to PUBLIC_DIR.

export const PUBLIC_DIR = new URL('../prototype-3d/public/', import.meta.url);

export const FEATURED_PROJECTS = [
  {
    title: 'MR ROBOT · Optimus Technica',
    purpose: 'Managed IT, business automation and custom software in Myanmar.',
    link: 'https://optimustechnica.com/',
    image: 'work/optimus-technica.webp',
  },
  {
    title: 'Leyar Shift',
    purpose: 'NASA Space Apps Challenge 2026. Compares crop rotations for a field by water, income and weather risk, using NASA Earth data.',
    link: 'https://leyarshift.earth/',
    image: 'work/leyar-shift.webp',
  },
  {
    title: 'Knowledge Center',
    purpose: 'Optimus Technica’s learning library: guides, technical references and field notes from the team.',
    link: 'https://knowledgecenter.optimustechnica.com/',
    image: 'work/knowledge-center.webp',
  },
  {
    title: 'PARADOX',
    purpose: 'Online store for PARADOX, a streetwear brand born in Burma in 2020.',
    link: 'https://burmesedox.com/',
    image: 'work/paradox.webp',
  },
];

export const LOCAL_CERTIFICATES = [
  {
    title: 'NASA Space Apps Challenge 2026: Galactic Problem Solver',
    issuerMeta: 'NASA · Nov 2026',
    verifyUrl: null,
    image: 'certs/nasa-space-apps-2026.webp',
  },
  {
    title: 'Certified LLM Security Expert (CLLMSE)',
    issuerMeta: 'Red Team Leaders · Jul 2026',
    verifyUrl: 'https://courses.redteamleaders.com/exam-completion/353ec986ea299586',
    image: 'certs/cllmse-2026.webp',
  },
  {
    title: 'Certified LLM Security Professional (CLLMSP)',
    issuerMeta: 'Red Team Leaders · Jun 2026',
    verifyUrl: 'https://courses.redteamleaders.com/exam-completion/60e9e4410d07bbc5',
    image: 'certs/cllmsp-2026.webp',
  },
];

// Matched on upper(trim(title)) against the old `projects` table.
export const RETIRED_PROJECT_TITLES = [
  'SLOW BAR',
  'SEIN LIN ELECTRONIC CENTER',
  'MR ROBOT COMPUTER SERVICE',
  'ZENITHLOVESDAISY',
  'TATTOO HOUSE',
  'PARADOX POS',
  'AI POWERED CONTENT CREATOR',
];

export const PLACEHOLDER_PURPOSE = /^(project|saas)\s*\d+$/i;
