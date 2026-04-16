import { load } from './profileStore';
import { matchProfile, type ProfileTags } from '../lib/matchProfile';

function applyFilter(): void {
  const profile = load();
  const nodes = document.querySelectorAll<HTMLElement>('[data-profile]');
  let totalFiltered = 0;

  nodes.forEach(node => {
    let tags: ProfileTags;
    try { tags = JSON.parse(node.dataset.profile ?? '{}') as ProfileTags; }
    catch { tags = {}; }
    const match = matchProfile(tags, profile);
    node.hidden = !match;
    if (!match) totalFiltered++;
  });

  // Mark page-level empty state
  const main = document.querySelector('main');
  if (main) {
    const hasContent = main.querySelector('[data-profile]:not([hidden])') || !main.querySelector('[data-profile]');
    main.dataset.filtered = String(totalFiltered);
    main.dataset.anyVisible = String(Boolean(hasContent));
  }

  // Inject empty-state banners into sections with all-filtered content
  document.querySelectorAll<HTMLElement>('[data-profile-group]').forEach(group => {
    const kids = group.querySelectorAll<HTMLElement>('[data-profile]');
    const visible = Array.from(kids).some(k => !k.hidden);
    const existing = group.querySelector('.filter-empty');
    if (!visible && kids.length > 0) {
      if (!existing) {
        const fallback = document.createElement('div');
        fallback.className = 'filter-empty';
        fallback.innerHTML = 'Nothing in this section matches your view. <button type="button" data-show-all>Show everything</button>';
        group.appendChild(fallback);
      }
    } else if (existing) {
      existing.remove();
    }
  });
}

document.addEventListener('click', (e) => {
  const target = e.target as HTMLElement;
  if (target.matches('[data-show-all]')) {
    import('./profileStore').then(({ save, load }) => {
      const cur = load() ?? {};
      save({ ...cur, showAll: true });
    });
  }
});

window.addEventListener('inpro:profile-change', applyFilter);
document.addEventListener('DOMContentLoaded', applyFilter);
if (document.readyState !== 'loading') applyFilter();
