import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { checkCv, checkImage, uploadPathname } from '../src/admin-upload.js';

const file = (name, type, size) => ({ name, type, size });
const MB = 1024 * 1024;

describe('checkImage', () => {
  it('accepts PNG, JPEG and WebP up to 4 MB', () => {
    for (const type of ['image/png', 'image/jpeg', 'image/webp']) {
      assert.equal(checkImage(file('a', type, 4 * MB)), null);
    }
  });

  it('rejects other types', () => {
    assert.equal(checkImage(file('a.gif', 'image/gif', 10)), 'Images must be PNG, JPEG or WebP.');
  });

  it('rejects files over 4 MB', () => {
    assert.equal(checkImage(file('a.png', 'image/png', 4 * MB + 1)), 'Images must be 4 MB or smaller.');
  });
});

describe('checkCv', () => {
  it('accepts a PDF up to 4 MB', () => {
    assert.equal(checkCv(file('cv.pdf', 'application/pdf', 4 * MB)), null);
  });

  it('rejects non-PDFs and oversized PDFs with the same message', () => {
    const message = 'The CV must be a PDF up to 4 MB.';
    assert.equal(checkCv(file('cv.docx', 'application/msword', 10)), message);
    assert.equal(checkCv(file('cv.pdf', 'application/pdf', 4 * MB + 1)), message);
  });
});

describe('uploadPathname', () => {
  it('slugifies the title and keeps the image extension', () => {
    assert.equal(uploadPathname('projects', 'Red Team Dashboard!', file('x.png', 'image/png', 1)), 'projects/red-team-dashboard.png');
    assert.equal(uploadPathname('certificates', 'OSCP', file('x.jpeg', 'image/jpeg', 1)), 'certificates/oscp.jpg');
    assert.equal(uploadPathname('projects', 'Shot', file('x', 'image/webp', 1)), 'projects/shot.webp');
  });

  it('strips accents and collapses separators', () => {
    assert.equal(uploadPathname('projects', '  Café -- Ünïcode  ', file('x.png', 'image/png', 1)), 'projects/cafe-unicode.png');
  });

  it('falls back to a neutral name when nothing slugifies', () => {
    assert.equal(uploadPathname('projects', '???', file('x.png', 'image/png', 1)), 'projects/image.png');
  });

  it('builds CV pathnames from the file name without its extension', () => {
    assert.equal(uploadPathname('cv', null, file('Clay Resume (2026).PDF', 'application/pdf', 1)), 'cv/clay-resume-2026.pdf');
  });
});
