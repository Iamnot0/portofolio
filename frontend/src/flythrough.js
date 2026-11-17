import { ScrollTrigger } from 'gsap/ScrollTrigger';

// Distance between projects along the depth axis, in CSS pixels at a 1000px perspective.
const GAP = 1100;

// Work projects wait one behind another in depth; the section pins and scrolling flies
// forward through them, so each comes to the front, holds, then sweeps past the viewer.
export function setupFlythrough({ section, list, lenis, reduceMotion }) {
  const cards = [...list.children].filter((child) => child.classList.contains('card'));
  if (!matchMedia('(min-width: 761px)').matches || cards.length < 2) return null;

  const count = cards.length;
  let eased = 0;
  section.classList.add('is-flythrough');

  const trigger = ScrollTrigger.create({
    trigger: section,
    start: 'top top',
    end: () => `+=${Math.round(window.innerHeight * 0.9 * (count - 1))}`,
    pin: true,
    anticipatePin: 1,
    refreshPriority: 1,
    invalidateOnRefresh: true,
  });

  // Keyboard users tab through every project; focusing one flies to it.
  cards.forEach((card, i) => {
    card.addEventListener('focusin', () => {
      const target = trigger.start + (trigger.end - trigger.start) * (i / (count - 1));
      if (lenis) lenis.scrollTo(target);
      else window.scrollTo(0, target);
    });
  });

  return {
    update() {
      eased += (trigger.progress - eased) * (reduceMotion ? 1 : 0.1);
      const position = eased * (count - 1);
      const vw = window.innerWidth / 100;
      const vh = window.innerHeight / 100;
      cards.forEach((card, i) => {
        // rel 0 = at the front, > 0 = waiting further away, < 0 = flown past.
        const rel = i - position;
        const ahead = Math.min(Math.max(rel, 0), 2);
        const side = i % 2 ? 1 : -1;
        const x = side * ahead * 55 * vw;
        const y = -ahead * 10 * vh;
        const z = -rel * GAP;
        const turn = -side * ahead * 14;
        const opacity = rel < 0
          ? Math.max(0, 1 + rel / 0.55)
          : Math.max(0, 1 - Math.max(0, rel - 1) * 0.45);
        card.style.transform = `translate3d(${x}px, ${y}px, ${Math.min(z, GAP * 0.55)}px) rotateY(${turn}deg)`;
        card.style.opacity = String(opacity);
        const front = Math.abs(rel) < 0.5;
        card.classList.toggle('is-front', front);
        card.style.pointerEvents = front ? 'auto' : 'none';
      });
    },
  };
}
