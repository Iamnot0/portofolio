import { el, getCertificates, getCV, getProjects, hostname } from './data.js';

function projectCard(project, index) {
  const body = [
    project.image
      ? el('img', { className: 'card-image', attrs: { src: project.image, alt: '', loading: 'lazy', decoding: 'async' } })
      : el('div', { className: 'card-image card-image--empty', text: project.title }),
    el('div', { className: 'card-body' }, [
      el('span', { className: 'card-index', text: String(index + 1).padStart(2, '0') }),
      el('h3', { className: 'card-title', text: project.title }),
      project.purpose ? el('p', { className: 'card-purpose', text: project.purpose }) : null,
      el('p', { className: 'card-stack', text: project.stack || hostname(project.link) }),
      el('span', { className: 'card-cta', text: project.link ? 'Visit the live site' : 'Not deployed' }),
    ]),
  ];
  const inner = project.link
    ? el('a', { className: 'card-inner', attrs: { href: project.link, target: '_blank', rel: 'noopener noreferrer' } }, body)
    : el('div', { className: 'card-inner card-inner--static' }, body);
  return el('li', { className: 'card' }, [inner]);
}

function certRow(cert, index) {
  const row = el('div', { className: 'row' }, [
    el('span', { className: 'row-index', text: String(index + 1).padStart(2, '0') }),
    el('span', { className: 'row-title', text: cert.title }),
    cert.meta ? el('span', { className: 'row-meta', text: cert.meta }) : null,
    cert.verify
      ? el('a', {
        className: 'row-verify',
        text: 'Verify',
        attrs: { href: cert.verify, target: '_blank', rel: 'noopener noreferrer', 'aria-label': `Verify ${cert.title}` },
      })
      : null,
  ]);
  if (cert.image) row.dataset.peek = cert.image;
  return el('li', {}, [row]);
}

const notice = (text) => el('li', { className: 'state', text });

async function loadProjects() {
  const projects = await getProjects();
  document.getElementById('workList').replaceChildren(...(projects.length
    ? projects.map(projectCard)
    : [notice('Projects are loading slowly. Refresh to try again.')]));
}

async function loadCertificates() {
  const list = document.getElementById('certList');
  const certs = await getCertificates();
  list.replaceChildren(...(certs.length
    ? certs.map(certRow)
    : [notice('Certifications are loading slowly. Refresh to try again.')]));
}

async function loadCV() {
  const cv = await getCV();
  if (!cv) return;
  document.getElementById('cvLink').href = cv.fileUrl;
  document.getElementById('cvItem').hidden = false;
}

export function loadContent() {
  return Promise.all([loadProjects(), loadCertificates(), loadCV()]);
}
