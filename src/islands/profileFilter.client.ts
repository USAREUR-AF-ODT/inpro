import { load, getSessionShowAll, setSessionShowAll } from './profileStore';
import { matchProfile, type ProfileTags } from '../lib/matchProfile';

function applyFilter(): void {
  const stored = load();
  const sessionShowAll = getSessionShowAll();
  const profile = stored && !sessionShowAll ? stored : stored ? { ...stored, showAll: true } : null;

  const nodes = document.querySelectorAll<HTMLElement>('[data-profile]');
  let total = 0;
  let visible = 0;

  nodes.forEach(node => {
    let tags: ProfileTags;
    try { tags = JSON.parse(node.dataset.profile ?? '{}') as ProfileTags; }
    catch { tags = {}; }
    const match = matchProfile(tags, profile);
    node.hidden = !match;
    total++;
    if (match) visible++;
  });

  const main = document.querySelector('main');
  if (main) {
    const hasContent = main.querySelector('[data-profile]:not([hidden])') || !main.querySelector('[data-profile]');
    main.dataset.filtered = String(total - visible);
    main.dataset.anyVisible = String(Boolean(hasContent));
  }

  document.querySelectorAll<HTMLElement>('[data-profile-group]').forEach(group => {
    const kids = group.querySelectorAll<HTMLElement>('[data-profile]');
    const visibleKids = Array.from(kids).some(k => !k.hidden);
    const existing = group.querySelector('.filter-empty');
    if (!visibleKids && kids.length > 0) {
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

  updateFilterStatus({ stored, sessionShowAll, total, visible });
}

interface StatusInput {
  stored: ReturnType<typeof load>;
  sessionShowAll: boolean;
  total: number;
  visible: number;
}

const DISMISS_KEY = 'inpro.fsDismissed.v1';

function dismissed(): boolean {
  try { return sessionStorage.getItem(DISMISS_KEY) === '1'; } catch { return false; }
}

function markDismissed(): void {
  try { sessionStorage.setItem(DISMISS_KEY, '1'); } catch { /* ignore */ }
}

function clearDismissed(): void {
  try { sessionStorage.removeItem(DISMISS_KEY); } catch { /* ignore */ }
}

function updateFilterStatus({ stored, sessionShowAll, total, visible }: StatusInput): void {
  const el = document.querySelector<HTMLElement>('[data-filter-status]');
  if (!el) return;

  const hasProfile = Boolean(stored) && !stored?.showAll;
  const hidden = total - visible;
  const shouldShow = hasProfile && !sessionShowAll && hidden > 0 && !dismissed();

  if (!shouldShow) { el.hidden = true; return; }
  el.hidden = false;

  const vEl = el.querySelector<HTMLElement>('[data-fs-visible]');
  const tEl = el.querySelector<HTMLElement>('[data-fs-total]');
  if (vEl) vEl.textContent = String(visible);
  if (tEl) tEl.textContent = String(total);
}

document.addEventListener('click', (e) => {
  const t = e.target as HTMLElement;
  if (t.matches('[data-show-all]') || t.closest('[data-fs-show-all]')) {
    setSessionShowAll(true);
    return;
  }
  if (t.closest('[data-fs-dismiss]')) {
    markDismissed();
    const el = document.querySelector<HTMLElement>('[data-filter-status]');
    if (el) el.hidden = true;
    return;
  }
  if (t.closest('[data-fs-change]')) {
    // Opening the picker already wired to [data-pp-open]; also clear the dismiss so
    // the caption returns if they save a narrower profile.
    clearDismissed();
  }
});

window.addEventListener('inpro:profile-change', applyFilter);
document.addEventListener('DOMContentLoaded', applyFilter);
if (document.readyState !== 'loading') applyFilter();
