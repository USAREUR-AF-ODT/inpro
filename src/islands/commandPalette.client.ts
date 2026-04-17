interface PagefindSubResult {
  title: string;
  url: string;
  anchor?: { id: string; text: string };
  excerpt: string;
}
interface PagefindResult {
  id: string;
  data: () => Promise<{
    url: string;
    meta: { title: string; [k: string]: string };
    excerpt: string;
    filters?: { topic?: string[]; phase?: string[] };
    sub_results?: PagefindSubResult[];
  }>;
}

interface Pagefind {
  search: (q: string) => Promise<{ results: PagefindResult[] }>;
  preload: (q: string) => Promise<void>;
  options?: (opts: Record<string, unknown>) => Promise<void>;
}

const TOPIC_LABEL: Record<string, string> = {
  housing: 'Housing',
  finance: 'Finance',
  medical: 'Medical',
  legal: 'Legal',
  vehicle: 'Vehicle',
  'id-cac': 'ID & CAC',
  family: 'Family',
  schools: 'Schools',
  pets: 'Pets',
  religious: 'Religious',
  mwr: 'MWR',
  unit: 'Unit',
};

const base = (document.querySelector<HTMLMetaElement>('meta[name="inpro-base"]')?.content ?? '').replace(/\/$/, '');

let pagefindPromise: Promise<Pagefind> | null = null;
function getPagefind(): Promise<Pagefind> {
  if (!pagefindPromise) {
    pagefindPromise = (async () => {
      const mod = await (import(/* @vite-ignore */ `${base}/pagefind/pagefind.js`) as unknown as Promise<Pagefind>);
      try { await mod.options?.({ excerptLength: 100 }); } catch { /* ignore */ }
      return mod;
    })();
  }
  return pagefindPromise;
}

function card(): HTMLElement | null {
  return document.querySelector<HTMLElement>('[data-cmdk]');
}
function input(): HTMLInputElement | null {
  return document.querySelector<HTMLInputElement>('[data-cmdk-input]');
}
function results(): HTMLElement | null {
  return document.querySelector<HTMLElement>('[data-cmdk-results]');
}

function isTypingTarget(el: EventTarget | null): boolean {
  if (!(el instanceof HTMLElement)) return false;
  if (el.isContentEditable) return true;
  const tag = el.tagName;
  return tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT';
}

function isOpen(): boolean {
  const c = card();
  return Boolean(c && !c.hidden);
}

function open(): void {
  const c = card();
  const i = input();
  if (!c || !i) return;
  c.hidden = false;
  document.body.style.overflow = 'hidden';
  i.value = '';
  renderInitial();
  requestAnimationFrame(() => i.focus());
  getPagefind().catch(() => { /* no-op; first-paint handled in search */ });
}

function close(): void {
  const c = card();
  if (!c) return;
  c.hidden = true;
  document.body.style.overflow = '';
}

function renderInitial(): void {
  const r = results();
  if (!r) return;
  r.innerHTML = `<p class="cmdk-hint">Type to search. <kbd>↑</kbd><kbd>↓</kbd> to move, <kbd>Enter</kbd> to open.</p>`;
}

function renderEmpty(q: string): void {
  const r = results();
  if (!r) return;
  r.innerHTML = `<div class="cmdk-empty">No results for <strong>${escapeHtml(q)}</strong>. Try a different term or <a href="${base}/search?q=${encodeURIComponent(q)}">open full search</a>.</div>`;
}

function renderLoading(): void {
  const r = results();
  if (!r) return;
  r.innerHTML = `<p class="cmdk-hint">Searching…</p>`;
}

async function renderResults(query: string): Promise<void> {
  const r = results();
  if (!r) return;
  try {
    const pagefind = await getPagefind();
    await pagefind.preload(query);
    const found = await pagefind.search(query);
    if (found.results.length === 0) { renderEmpty(query); return; }

    const top = found.results.slice(0, 6);
    const rows = await Promise.all(top.map(res => res.data()));
    r.innerHTML = rows.map((d, i) => resultHtml(d, i === 0)).join('');
    attachRowHandlers();
  } catch (err) {
    console.warn('Pagefind search failed:', err);
    const r2 = results();
    if (r2) r2.innerHTML = `<div class="cmdk-empty">Search index unavailable. <a href="${base}/search">Open full search</a>.</div>`;
  }
}

function resultHtml(d: Awaited<ReturnType<PagefindResult['data']>>, firstActive: boolean): string {
  const topicTag = d.filters?.topic?.[0];
  const topicLabel = topicTag ? (TOPIC_LABEL[topicTag] ?? topicTag) : '';
  const subs = (d.sub_results ?? []).filter(s => s.anchor && s.anchor.id).slice(0, 3);

  const parent = `<a class="cmdk-row" href="${d.url}" data-cmdk-row${firstActive ? ' data-active' : ''} role="option" aria-selected="${firstActive}">
    <span class="cmdk-row-title">${escapeHtml(d.meta.title)}</span>
    ${topicLabel ? `<span class="cmdk-row-topic">${escapeHtml(topicLabel)}</span>` : ''}
    <p class="cmdk-row-excerpt">${d.excerpt}</p>
  </a>`;

  const subsMarkup = subs.map(s => `<a class="cmdk-subrow" href="${s.url}" data-cmdk-row role="option" aria-selected="false">
    <span class="cmdk-subrow-arrow" aria-hidden="true">↳</span>
    <span class="cmdk-subrow-title">${escapeHtml(s.anchor?.text ?? s.title)}</span>
    <p class="cmdk-subrow-excerpt">${s.excerpt}</p>
  </a>`).join('');

  return parent + subsMarkup;
}

function escapeHtml(s: string): string {
  return s.replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c] ?? c));
}

function attachRowHandlers(): void {
  const rows = Array.from(document.querySelectorAll<HTMLAnchorElement>('[data-cmdk-row]'));
  rows.forEach(row => {
    row.addEventListener('mousemove', () => {
      rows.forEach(r => r.removeAttribute('data-active'));
      row.setAttribute('data-active', '');
    });
  });
}

function moveSelection(delta: number): void {
  const rows = Array.from(document.querySelectorAll<HTMLAnchorElement>('[data-cmdk-row]'));
  if (rows.length === 0) return;
  const currentIdx = rows.findIndex(r => r.hasAttribute('data-active'));
  const nextIdx = ((currentIdx === -1 ? 0 : currentIdx) + delta + rows.length) % rows.length;
  rows.forEach(r => r.removeAttribute('data-active'));
  rows[nextIdx].setAttribute('data-active', '');
  rows[nextIdx].scrollIntoView({ block: 'nearest' });
  rows.forEach((r, i) => r.setAttribute('aria-selected', String(i === nextIdx)));
}

function openActive(): void {
  const active = document.querySelector<HTMLAnchorElement>('[data-cmdk-row][data-active]');
  if (active) { close(); active.click(); }
}

let searchTimer: number | null = null;
function onInput(e: Event): void {
  const q = (e.target as HTMLInputElement).value.trim();
  if (searchTimer) { clearTimeout(searchTimer); searchTimer = null; }
  if (!q) { renderInitial(); return; }
  renderLoading();
  searchTimer = window.setTimeout(() => { renderResults(q); }, 120);
}

function onKey(e: KeyboardEvent): void {
  // Global shortcuts for opening
  const typing = isTypingTarget(e.target) && !(e.target as HTMLElement).matches('[data-cmdk-input]');
  if (!isOpen() && !typing && !e.metaKey && !e.ctrlKey && !e.altKey && e.key === '/') {
    e.preventDefault();
    open();
    return;
  }
  if ((e.metaKey || e.ctrlKey) && (e.key === 'k' || e.key === 'K')) {
    e.preventDefault();
    if (isOpen()) close(); else open();
    return;
  }

  if (!isOpen()) return;

  if (e.key === 'Escape') { e.preventDefault(); close(); return; }
  if (e.key === 'ArrowDown') { e.preventDefault(); moveSelection(1); return; }
  if (e.key === 'ArrowUp') { e.preventDefault(); moveSelection(-1); return; }
  if (e.key === 'Enter') { e.preventDefault(); openActive(); return; }
}

function init(): void {
  document.addEventListener('keydown', onKey);
  document.addEventListener('click', (e) => {
    const t = e.target as HTMLElement;
    if (t.closest('[data-cmdk-close]')) { close(); return; }
    if (t.closest('[data-cmdk-open]')) { open(); return; }
  });
  input()?.addEventListener('input', onInput);
}

document.addEventListener('DOMContentLoaded', init);
if (document.readyState !== 'loading') init();

export {};
