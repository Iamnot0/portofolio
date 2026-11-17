import assert from 'node:assert/strict';
import { afterEach, describe, it } from 'node:test';
import { getCertificates, getCV, getProjects, publicLink } from '../src/data.js';

const realFetch = globalThis.fetch;
afterEach(() => { globalThis.fetch = realFetch; });

const json = (body, status = 200) => new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });
const stubFetch = (handler) => {
  const calls = [];
  globalThis.fetch = async (url, init) => {
    calls.push(url);
    return handler(url, init);
  };
  return calls;
};
const failing = () => { globalThis.fetch = async () => { throw new TypeError('fetch failed'); }; };

const project = {
  id: 1,
  title: ' Leyar Shift ',
  purpose: 'Crop rotation planner.',
  stack: 'Node, Postgres',
  link: 'https://leyarshift.earth/',
  imageUrl: 'https://abc.public.blob.vercel-storage.com/leyar.webp',
};

describe('getProjects', () => {
  it('returns an empty list when fetch rejects', async () => {
    failing();
    assert.deepEqual(await getProjects(), []);
  });

  it('returns an empty list on a server error', async () => {
    stubFetch(() => json({ error: 'Something went wrong' }, 500));
    assert.deepEqual(await getProjects(), []);
  });

  it('returns an empty list when the body is not a list', async () => {
    stubFetch(() => json({ projects: [] }));
    assert.deepEqual(await getProjects(), []);
  });

  it('reads the same-origin API and maps imageUrl to image', async () => {
    const calls = stubFetch(() => json([project]));
    const [mapped] = await getProjects();
    assert.deepEqual(calls, ['/api/projects']);
    assert.deepEqual(mapped, {
      title: 'Leyar Shift',
      purpose: 'Crop rotation planner.',
      stack: 'Node, Postgres',
      link: 'https://leyarshift.earth/',
      image: 'https://abc.public.blob.vercel-storage.com/leyar.webp',
    });
  });

  it('drops links and images that are not https', async () => {
    stubFetch(() => json([{ ...project, link: 'javascript:alert(1)', imageUrl: 'http://example.com/a.png' }]));
    const [mapped] = await getProjects();
    assert.equal(mapped.link, null);
    assert.equal(mapped.image, null);
  });

  it('keeps rows that have no link or image', async () => {
    stubFetch(() => json([{ ...project, link: null, imageUrl: null }]));
    const [mapped] = await getProjects();
    assert.equal(mapped.link, null);
    assert.equal(mapped.image, null);
  });
});

describe('getCertificates', () => {
  const cert = {
    id: 3,
    title: 'Certified LLM Security Expert',
    issuerMeta: 'Red Team Leaders · Jul 2026',
    verifyUrl: 'https://courses.redteamleaders.com/exam-completion/abc',
    imageUrl: 'https://abc.public.blob.vercel-storage.com/cllmse.webp',
  };

  it('returns an empty list when fetch rejects', async () => {
    failing();
    assert.deepEqual(await getCertificates(), []);
  });

  it('returns an empty list on a server error', async () => {
    stubFetch(() => json({ error: 'nope' }, 503));
    assert.deepEqual(await getCertificates(), []);
  });

  it('maps the API shape to the row shape', async () => {
    const calls = stubFetch(() => json([cert]));
    const [mapped] = await getCertificates();
    assert.deepEqual(calls, ['/api/certificates']);
    assert.deepEqual(mapped, {
      title: 'Certified LLM Security Expert',
      meta: 'Red Team Leaders · Jul 2026',
      image: 'https://abc.public.blob.vercel-storage.com/cllmse.webp',
      verify: 'https://courses.redteamleaders.com/exam-completion/abc',
    });
  });

  it('drops a verify link that is not https', async () => {
    stubFetch(() => json([{ ...cert, verifyUrl: 'ftp://example.com/x' }]));
    const [mapped] = await getCertificates();
    assert.equal(mapped.verify, null);
  });
});

describe('getCV', () => {
  const cv = { fileUrl: 'https://abc.public.blob.vercel-storage.com/cv.pdf', fileName: 'Clay-CV.pdf', uploadedAt: '2026-11-01T10:00:00.000Z' };

  it('returns null when fetch rejects', async () => {
    failing();
    assert.equal(await getCV(), null);
  });

  it('returns null on a server error', async () => {
    stubFetch(() => json({ error: 'nope' }, 500));
    assert.equal(await getCV(), null);
  });

  it('returns null when no CV is uploaded', async () => {
    stubFetch(() => json(null));
    assert.equal(await getCV(), null);
  });

  it('returns the file with a validated https url', async () => {
    const calls = stubFetch(() => json(cv));
    assert.deepEqual(await getCV(), cv);
    assert.deepEqual(calls, ['/api/cv']);
  });

  it('returns null when the file url is not https', async () => {
    stubFetch(() => json({ ...cv, fileUrl: 'data:application/pdf;base64,AAAA' }));
    assert.equal(await getCV(), null);
  });
});

describe('publicLink', () => {
  it('accepts https urls only', () => {
    assert.equal(publicLink('https://optimustechnica.com/'), 'https://optimustechnica.com/');
    assert.equal(publicLink('http://optimustechnica.com/'), null);
    assert.equal(publicLink('javascript:alert(1)'), null);
    assert.equal(publicLink('not a url'), null);
    assert.equal(publicLink(null), null);
  });
});
