const THRESHOLD = 400;

function init(): void {
  const btn = document.querySelector<HTMLButtonElement>('[data-back-to-top]');
  if (!btn) return;

  // Hide globally on the search page (search input sits near the top).
  if (location.pathname.replace(/\/$/, '').endsWith('/search')) {
    btn.hidden = true;
    return;
  }

  const docShort = document.documentElement.scrollHeight <= window.innerHeight + THRESHOLD;
  if (docShort) {
    btn.hidden = true;
    return;
  }

  btn.hidden = false;

  const onScroll = (): void => {
    if (window.scrollY > THRESHOLD) btn.setAttribute('data-visible', '');
    else btn.removeAttribute('data-visible');
  };

  window.addEventListener('scroll', onScroll, { passive: true });
  onScroll();

  const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  btn.addEventListener('click', () => {
    window.scrollTo({ top: 0, behavior: reduced ? 'auto' : 'smooth' });
  });
}

document.addEventListener('DOMContentLoaded', init);
if (document.readyState !== 'loading') init();
