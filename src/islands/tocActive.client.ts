function init(): void {
  const links = Array.from(document.querySelectorAll<HTMLAnchorElement>('[data-toc-link]'));
  if (links.length === 0) return;

  const ids = links
    .map(a => (a.getAttribute('href') ?? '').replace(/^#/, ''))
    .filter(Boolean);
  const targets = ids
    .map(id => document.getElementById(id))
    .filter((el): el is HTMLElement => Boolean(el));
  if (targets.length === 0) return;

  const byId = new Map<string, HTMLAnchorElement>();
  links.forEach(a => {
    const id = (a.getAttribute('href') ?? '').replace(/^#/, '');
    if (id) byId.set(id, a);
  });

  const clearActive = (): void => {
    links.forEach(a => a.removeAttribute('data-active'));
  };

  const setActive = (id: string): void => {
    clearActive();
    byId.get(id)?.setAttribute('data-active', '');
  };

  const headerOffset = (): number => {
    const v = getComputedStyle(document.documentElement).getPropertyValue('--header-h').trim();
    const n = parseFloat(v);
    return Number.isFinite(n) ? n + 60 : 100;
  };

  const obs = new IntersectionObserver(entries => {
    const inView = entries
      .filter(e => e.isIntersecting)
      .sort((a, b) => a.boundingClientRect.top - b.boundingClientRect.top);
    if (inView.length > 0) {
      setActive(inView[0].target.id);
    }
  }, {
    rootMargin: `-${headerOffset()}px 0px -70% 0px`,
    threshold: [0, 1],
  });

  targets.forEach(t => obs.observe(t));

  // Smooth-scroll with offset for sticky header.
  const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  links.forEach(a => {
    a.addEventListener('click', (e) => {
      const id = (a.getAttribute('href') ?? '').replace(/^#/, '');
      const el = document.getElementById(id);
      if (!el) return;
      e.preventDefault();
      const offset = headerOffset();
      const top = el.getBoundingClientRect().top + window.scrollY - offset;
      window.scrollTo({ top, behavior: reduced ? 'auto' : 'smooth' });
      history.replaceState(null, '', `#${id}`);
      setActive(id);
    });
  });
}

document.addEventListener('DOMContentLoaded', init);
if (document.readyState !== 'loading') init();
