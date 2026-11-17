// Each page section has a clean URL (/contact, /work, …). Links scroll to the section in place,
// the address bar follows the section in view, and opening a section URL directly lands on it.

const SECTIONS = ['experience', 'work', 'founder', 'certifications', 'contact'];

export function sectionForPath(pathname) {
  const name = pathname.replace(/^\/+|\/+$/g, '');
  return SECTIONS.includes(name) ? name : null;
}

function pathForSection(id) {
  return SECTIONS.includes(id) ? `/${id}` : '/';
}

export function setupSectionRoutes({ lenis, ScrollTrigger }) {
  const scrollToSection = (id, immediate = false) => {
    const target = id ? document.getElementById(id) : 0;
    if (lenis) lenis.scrollTo(target, { immediate });
    else if (id) target.scrollIntoView({ behavior: immediate ? 'auto' : 'smooth' });
    else window.scrollTo({ top: 0, behavior: immediate ? 'auto' : 'smooth' });
  };

  let navigating = false;
  // The address bar only follows scrolling after the page has landed on the requested section.
  let landed = false;
  document.addEventListener('click', (event) => {
    const link = event.target.closest?.('a[data-route]');
    if (!link || event.metaKey || event.ctrlKey || event.shiftKey || event.button !== 0) return;
    event.preventDefault();
    const id = sectionForPath(link.getAttribute('href'));
    if (location.pathname !== link.getAttribute('href')) history.pushState(null, '', link.getAttribute('href'));
    navigating = true;
    scrollToSection(id);
    setTimeout(() => { navigating = false; }, 1200);
    if (id) document.getElementById(id).focus({ preventScroll: true });
  });

  window.addEventListener('popstate', () => scrollToSection(sectionForPath(location.pathname)));

  // Keep the address bar on the section being read, without adding history entries.
  for (const id of ['top', ...SECTIONS]) {
    const section = document.getElementById(id);
    if (!section) continue;
    ScrollTrigger.create({
      trigger: section,
      start: 'top 50%',
      end: 'bottom 50%',
      onToggle: (self) => {
        if (!self.isActive || navigating || !landed) return;
        const path = pathForSection(id);
        if (location.pathname !== path) history.replaceState(null, '', path);
      },
    });
  }

  return {
    // Called once content has loaded and layout is final.
    landOnCurrentPath() {
      const id = sectionForPath(location.pathname);
      // Lenis caches the page height; re-measure now that content and pin spacing exist.
      lenis?.resize();
      if (id) scrollToSection(id, true);
      requestAnimationFrame(() => { landed = true; });
    },
  };
}
