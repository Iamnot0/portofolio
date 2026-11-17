import Lenis from 'lenis';
import { gsap } from 'gsap';
import { ScrollTrigger } from 'gsap/ScrollTrigger';
import { createScene } from './scene.js';
import { setupFlythrough } from './flythrough.js';
import { loadContent } from './content.js';

gsap.registerPlugin(ScrollTrigger);

const reduceMotion = matchMedia('(prefers-reduced-motion: reduce)').matches;
const finePointer = matchMedia('(hover: hover) and (pointer: fine)').matches;

const lenis = reduceMotion ? null : new Lenis({ lerp: 0.09, anchors: true });
lenis?.on('scroll', ScrollTrigger.update);

let scene = null;
let flythrough = null;

const stageTriggers = [...document.querySelectorAll('[data-stage]')].map((section, index) => (
  index === 0 ? null : ScrollTrigger.create({ trigger: section, start: 'top bottom', end: 'top 25%' })
));

const peek = document.getElementById('peek');
const peekPos = { x: 0, y: 0, tx: 0, ty: 0 };

gsap.ticker.lagSmoothing(0);
gsap.ticker.add((time, deltaMs) => {
  lenis?.raf(time * 1000);
  const max = document.documentElement.scrollHeight - window.innerHeight;
  scene?.setScrollFraction(max > 0 ? window.scrollY / max : 0);
  scene?.render(deltaMs / 1000);
  flythrough?.update();
  if (finePointer) {
    peekPos.x += (peekPos.tx - peekPos.x) * 0.18;
    peekPos.y += (peekPos.ty - peekPos.y) * 0.18;
    peek.style.transform = `translate3d(${peekPos.x}px, ${peekPos.y}px, 0) translate(-50%, -50%)`;
  }
});

createScene(document.getElementById('scene'), { reduceMotion }).then((created) => {
  scene = created;
  scene?.setProgressSource(() => stageTriggers.map((trigger) => trigger?.progress ?? 0));
});

if (finePointer) {
  window.addEventListener('pointermove', (event) => {
    const offset = peek.offsetWidth / 2 + 32;
    peekPos.tx = event.clientX > window.innerWidth * 0.62 ? event.clientX - offset : event.clientX + offset;
    peekPos.ty = event.clientY;
  }, { passive: true });
  document.addEventListener('pointerover', (event) => {
    const row = event.target.closest?.('[data-peek]');
    if (row) {
      if (peek.getAttribute('src') !== row.dataset.peek) peek.src = row.dataset.peek;
      peek.classList.add('is-visible');
    } else {
      peek.classList.remove('is-visible');
    }
  });

  const photo = document.querySelector('.founder-photo');
  const tiltX = gsap.quickTo(photo, 'rotateX', { duration: 0.6, ease: 'power3.out' });
  const tiltY = gsap.quickTo(photo, 'rotateY', { duration: 0.6, ease: 'power3.out' });
  gsap.set(photo, { transformPerspective: 900 });
  photo.addEventListener('pointermove', (event) => {
    const box = photo.getBoundingClientRect();
    tiltY(((event.clientX - box.left) / box.width - 0.5) * 14);
    tiltX(-((event.clientY - box.top) / box.height - 0.5) * 14);
  });
  photo.addEventListener('pointerleave', () => { tiltX(0); tiltY(0); });
}

const toggle = document.getElementById('themeToggle');
function applyTheme(theme) {
  document.documentElement.dataset.theme = theme;
  toggle.textContent = theme === 'dark' ? 'Light' : 'Dark';
  toggle.setAttribute('aria-pressed', String(theme === 'dark'));
  toggle.setAttribute('aria-label', `Switch to ${theme === 'dark' ? 'light' : 'dark'} theme`);
  scene?.setTheme(theme);
}
applyTheme(document.documentElement.dataset.theme);
toggle.addEventListener('click', () => {
  const next = document.documentElement.dataset.theme === 'dark' ? 'light' : 'dark';
  try { localStorage.setItem('theme', next); } catch { /* storage unavailable: theme still switches */ }
  applyTheme(next);
});

// Content rises out of depth as it scrolls in, and tips back as it leaves.
function riseInDepth(targets, trigger) {
  gsap.fromTo(targets,
    { rotateX: 28, z: -220, y: 60, opacity: 0, transformPerspective: 1100, transformOrigin: '50% 100%' },
    {
      rotateX: 0, z: 0, y: 0, opacity: 1, ease: 'none', stagger: 0.08,
      scrollTrigger: { trigger, start: 'top 92%', end: 'top 50%', scrub: 0.8 },
    });
}

if (!reduceMotion) {
  const title = document.querySelector('.hero-title');
  title.replaceChildren(...[...title.textContent].map((char) => {
    const span = document.createElement('span');
    span.className = 'char';
    span.setAttribute('aria-hidden', 'true');
    span.textContent = char;
    return span;
  }));
  gsap.from('.hero-title .char', { yPercent: 110, rotateX: -80, transformPerspective: 800, duration: 1.3, ease: 'expo.out', stagger: 0.07, delay: 0.1 });
  gsap.from('.hero-copy > *', { y: 24, opacity: 0, duration: 1, ease: 'power3.out', stagger: 0.1, delay: 0.45 });

  gsap.to('.hero-title, .hero-copy', {
    rotateX: -18, z: -260, opacity: 0, transformPerspective: 1100, transformOrigin: '50% 0%', ease: 'none',
    scrollTrigger: { trigger: '.hero', start: 'top top', end: 'bottom top', scrub: 0.6 },
  });

  for (const head of document.querySelectorAll('.section-head')) riseInDepth(head, head);
  riseInDepth('.founder-photo', '.founder');
  riseInDepth('.founder-copy > *', '.founder-copy');
  riseInDepth('.contact > *', '.contact');
}

loadContent().then(() => {
  flythrough = setupFlythrough({
    section: document.getElementById('work'),
    list: document.getElementById('workList'),
    lenis,
    reduceMotion,
  });
  if (!reduceMotion) {
    for (const row of document.querySelectorAll('#certList > li')) riseInDepth(row, row);
    if (!flythrough) for (const card of document.querySelectorAll('#workList > .card')) riseInDepth(card, card);
  }
  ScrollTrigger.sort();
  ScrollTrigger.refresh();
});
