import { load, save, summary, hasSeenBanner, markBannerSeen, setSessionShowAll } from './profileStore';
import type { Profile } from '../lib/matchProfile';

const STATUS_OPTIONS = [
  { v: 'soldier', l: 'Soldier' },
  { v: 'daciv', l: 'DA Civilian' },
  { v: 'contractor', l: 'Contractor' },
  { v: 'family', l: 'Family Member' },
];
const RANK_OPTIONS = [
  { v: 'E1-E4', l: 'E1–E4' },
  { v: 'E5-E6', l: 'E5–E6' },
  { v: 'E7-E9', l: 'E7–E9' },
  { v: 'WO', l: 'Warrant Officer' },
  { v: 'CO-FG', l: 'CO / FG Officer' },
  { v: 'GS', l: 'GS Civilian' },
];
const YN: Array<{ v: 'yes' | 'no' | 'any'; l: string }> = [
  { v: 'yes', l: 'Yes' },
  { v: 'no', l: 'No' },
  { v: 'any', l: 'Skip' },
];

type PickerEl = HTMLElement & { _open?: boolean };

function modalHtml(p: Profile | null): string {
  const cur = p ?? {};
  const radio = (name: string, opts: Array<{ v: string; l: string }>, current: string | undefined) =>
    opts.map(o =>
      `<label class="pp-opt"><input type="radio" name="${name}" value="${o.v}"${current === o.v ? ' checked' : ''}> <span>${o.l}</span></label>`
    ).join('');

  return `
<div class="pp-backdrop" data-close>
  <form class="pp-modal" role="dialog" aria-modal="true" aria-labelledby="pp-title" onclick="event.stopPropagation()">
    <div class="pp-head">
      <h2 id="pp-title">Set your view</h2>
      <button type="button" class="pp-x" data-close aria-label="Close">×</button>
    </div>
    <p class="pp-lead">Nothing leaves this device. Filter shows content relevant to your situation. Change anytime.</p>

    <fieldset>
      <legend>Status</legend>
      <div class="pp-grid">${radio('status', STATUS_OPTIONS, cur.status)}</div>
    </fieldset>

    <fieldset>
      <legend>Rank band</legend>
      <div class="pp-grid">${radio('rank', RANK_OPTIONS, cur.rank)}</div>
    </fieldset>

    <fieldset>
      <legend>Accompanied by family?</legend>
      <div class="pp-grid">${radio('accompanied', YN, cur.accompanied)}</div>
    </fieldset>

    <fieldset>
      <legend>Kids coming?</legend>
      <div class="pp-grid">${radio('has_kids', YN, cur.has_kids)}</div>
    </fieldset>

    <fieldset>
      <legend>Shipping a POV?</legend>
      <div class="pp-grid">${radio('has_pov', YN, cur.has_pov)}</div>
    </fieldset>

    <fieldset>
      <legend>Pets?</legend>
      <div class="pp-grid">${radio('has_pets', YN, cur.has_pets)}</div>
    </fieldset>

    <div class="pp-foot">
      <button type="button" class="btn btn--ghost" data-show-all>Skip — show everything</button>
      <button type="submit" class="btn">Save view</button>
    </div>
  </form>
</div>`;
}

function injectStyles(): void {
  if (document.getElementById('pp-styles')) return;
  const s = document.createElement('style');
  s.id = 'pp-styles';
  s.textContent = `
.pp-backdrop { position: fixed; inset: 0; background: rgba(42,32,22,.55); display: flex; align-items: center; justify-content: center; padding: 1rem; z-index: 100; }
.pp-modal { background: var(--paper); border: 1px solid var(--rule); border-radius: var(--radius); padding: 1.5rem; width: 100%; max-width: 32rem; max-height: 90vh; overflow-y: auto; box-shadow: var(--shadow-lift); font-family: var(--font-sans); }
.pp-head { display:flex; justify-content:space-between; align-items:center; margin-bottom:.5rem; }
.pp-head h2 { margin:0; font-size:1.25rem; }
.pp-x { background:none; border:none; font-size:1.5rem; line-height:1; cursor:pointer; color:var(--muted); padding:0.25rem 0.5rem; }
.pp-lead { font-size:.9rem; color:var(--muted); margin:0 0 1rem; }
.pp-modal fieldset { border: 0; padding: 0; margin: 0 0 1rem; }
.pp-modal legend { font-weight:600; font-size:.9rem; margin-bottom:.4rem; color:var(--ink); }
.pp-grid { display:grid; grid-template-columns: repeat(auto-fit, minmax(8rem, 1fr)); gap:.4rem; }
.pp-opt { display:flex; align-items:center; gap:.4rem; padding:.45rem .6rem; border:1px solid var(--rule); border-radius:8px; background:var(--paper-warm); cursor:pointer; font-size:.9rem; }
.pp-opt:has(input:checked) { border-color: var(--plum); background:var(--paper); }
.pp-opt input { accent-color: var(--plum); }
.pp-foot { display:flex; gap:.5rem; justify-content:flex-end; flex-wrap:wrap; margin-top:1rem; padding-top:1rem; border-top:1px solid var(--rule); }
.pp-banner { background: var(--paper-warm); border: 1px solid var(--rule); border-radius: var(--radius); padding: 0.9rem 1rem; display:flex; flex-wrap:wrap; gap:.75rem; align-items:center; justify-content: space-between; font-family:var(--font-sans); font-size:.95rem; }
.pp-banner p { margin: 0; flex: 1 1 20rem; }
.pp-banner .pp-actions { display:flex; gap:.4rem; flex-wrap:wrap; }
.profile-badge { display:inline-flex; align-items:center; gap:.4rem; font-family:var(--font-sans); font-size:.85rem; padding:.35rem .7rem; border-radius:999px; background:var(--paper-warm); border:1px solid var(--rule); color:var(--ink); cursor:pointer; }
.profile-badge:hover { background:var(--paper); border-color:var(--ochre); }
.profile-badge .dot { width:.5rem; height:.5rem; border-radius:50%; background:var(--forest); }
`;
  document.head.appendChild(s);
}

function openPicker(): void {
  injectStyles();
  const root = document.createElement('div');
  root.innerHTML = modalHtml(load());
  document.body.appendChild(root);

  const close = () => root.remove();
  root.querySelectorAll('[data-close]').forEach(el => el.addEventListener('click', (e) => {
    if (e.target === e.currentTarget) close();
  }));
  root.querySelector('[data-show-all]')?.addEventListener('click', () => {
    save({ ...(load() ?? {}), showAll: true });
    markBannerSeen();
    close();
  });

  const form = root.querySelector('form')!;
  form.addEventListener('submit', (e) => {
    e.preventDefault();
    const data = new FormData(form);
    const next: Profile = {
      status: (data.get('status') as Profile['status']) || undefined,
      rank: (data.get('rank') as Profile['rank']) || undefined,
      accompanied: (data.get('accompanied') as Profile['accompanied']) || undefined,
      has_kids: (data.get('has_kids') as Profile['has_kids']) || undefined,
      has_pov: (data.get('has_pov') as Profile['has_pov']) || undefined,
      has_pets: (data.get('has_pets') as Profile['has_pets']) || undefined,
      showAll: false,
    };
    setSessionShowAll(false);
    save(next);
    markBannerSeen();
    close();
  });

  document.addEventListener('keydown', function esc(e) {
    if (e.key === 'Escape') { close(); document.removeEventListener('keydown', esc); }
  });
}

function mountBadge(el: HTMLElement): void {
  injectStyles();
  const render = () => {
    const p = load();
    el.innerHTML = `<button type="button" class="profile-badge" data-pp-open>
      <span class="dot" aria-hidden="true"></span>${summary(p)}
    </button>`;
  };
  render();
  window.addEventListener('inpro:profile-change', render);
  el.addEventListener('click', (e) => {
    if ((e.target as HTMLElement).closest('[data-pp-open]')) openPicker();
  });
}

function mountBanner(el: HTMLElement): void {
  injectStyles();
  if (hasSeenBanner() || load()) { el.hidden = true; return; }
  // Banner HTML is SSR-rendered in BaseLayout so first paint already shows it
  // (prevents CLS from late injection). Only inject when SSR content is missing.
  if (!el.querySelector('.pp-banner')) {
    el.innerHTML = `
<div class="pp-banner">
  <p><strong>New here?</strong> Set your view so we can highlight what's relevant to your situation. No signup, stays on your device.</p>
  <div class="pp-actions">
    <button type="button" class="btn" data-pp-open>Set my view</button>
    <button type="button" class="btn btn--ghost" data-pp-skip>Skip — show everything</button>
  </div>
</div>`;
  }
  el.addEventListener('click', (e) => {
    const t = e.target as HTMLElement;
    if (t.closest('[data-pp-open]')) { openPicker(); markBannerSeen(); el.hidden = true; }
    if (t.closest('[data-pp-skip]')) {
      save({ ...(load() ?? {}), showAll: true });
      markBannerSeen();
      el.hidden = true;
    }
  });
}

// Mount any badge/banner instances present in DOM
document.querySelectorAll<PickerEl>('[data-pp-badge]').forEach(mountBadge);
document.querySelectorAll<PickerEl>('[data-pp-banner]').forEach(mountBanner);

// Global fallback: any [data-pp-open] trigger outside a mounted badge/banner
// (e.g. inside the profile-filter status caption) opens the picker.
document.addEventListener('click', (e) => {
  const t = e.target as HTMLElement;
  const trigger = t.closest('[data-pp-open]');
  if (!trigger) return;
  if (trigger.closest('[data-pp-badge]') || trigger.closest('[data-pp-banner]')) return;
  openPicker();
});
