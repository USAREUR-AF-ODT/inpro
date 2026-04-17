function measure(): void {
  const header = document.querySelector<HTMLElement>('.site-header');
  const filter = document.querySelector<HTMLElement>('[data-filter-status]:not([hidden])');
  let h = header ? header.getBoundingClientRect().height : 0;
  if (filter) h += filter.getBoundingClientRect().height;
  document.documentElement.style.setProperty('--header-h', `${Math.round(h)}px`);
}

document.addEventListener('DOMContentLoaded', measure);
if (document.readyState !== 'loading') measure();
window.addEventListener('resize', measure, { passive: true });
window.addEventListener('inpro:profile-change', () => setTimeout(measure, 20));

// Observe mutations on the filter status so hidden → visible flips recalculate.
const obs = new MutationObserver(() => measure());
document.querySelectorAll('[data-filter-status]').forEach(el => {
  obs.observe(el, { attributes: true, attributeFilter: ['hidden'] });
});
