interface RecentEntry {
  slug: string;
  title: string;
  topic: string;
  visited_at: number;
}

const KEY = 'inpro.recent.v1';
const MAX = 5;

function load(): RecentEntry[] {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch { return []; }
}

function save(entries: RecentEntry[]): void {
  try { localStorage.setItem(KEY, JSON.stringify(entries)); }
  catch { /* ignore */ }
}

function push(entry: RecentEntry): void {
  const current = load().filter(e => e.slug !== entry.slug);
  current.unshift(entry);
  save(current.slice(0, MAX));
}

function init(): void {
  const meta = document.querySelector<HTMLMetaElement>('meta[name="inpro-entry"]');
  if (!meta) return;
  const slug = meta.getAttribute('data-slug') ?? '';
  const title = meta.getAttribute('data-title') ?? '';
  const topic = meta.getAttribute('data-topic') ?? '';
  if (!slug || !title) return;
  push({ slug, title, topic, visited_at: Date.now() });
}

document.addEventListener('DOMContentLoaded', init);
if (document.readyState !== 'loading') init();
