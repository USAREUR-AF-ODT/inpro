interface RecentEntry {
  slug: string;
  title: string;
  topic: string;
  visited_at: number;
}

const KEY = 'inpro.recent.v1';
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

function load(): RecentEntry[] {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch { return []; }
}

function clear(): void {
  try { localStorage.removeItem(KEY); } catch { /* ignore */ }
}

const HINT_KEY = 'inpro.rvHintDismissed.v1';
function hintDismissed(): boolean {
  try { return sessionStorage.getItem(HINT_KEY) === '1'; } catch { return false; }
}
function markHintDismissed(): void {
  try { sessionStorage.setItem(HINT_KEY, '1'); } catch { /* ignore */ }
}

function escape(s: string): string {
  return s.replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c] ?? c));
}

function render(): void {
  const container = document.querySelector<HTMLElement>('[data-recently-viewed]');
  const list = document.querySelector<HTMLElement>('[data-rv-list]');
  const hint = document.querySelector<HTMLElement>('[data-rv-empty-hint]');
  const title = document.querySelector<HTMLElement>('[data-rv-title]');
  const clearBtn = document.querySelector<HTMLElement>('[data-rv-clear]');
  if (!container || !list || !hint || !title) return;

  const entries = load();
  if (entries.length === 0) {
    if (hintDismissed()) {
      container.hidden = true;
      return;
    }
    container.hidden = false;
    title.textContent = 'Recently viewed';
    list.hidden = true;
    hint.hidden = false;
    if (clearBtn) clearBtn.hidden = true;
    return;
  }

  container.hidden = false;
  title.textContent = 'Pick up where you left off';
  list.hidden = false;
  hint.hidden = true;
  if (clearBtn) clearBtn.hidden = false;
  list.innerHTML = entries.map(e => {
    const label = TOPIC_LABEL[e.topic] ?? e.topic;
    return `<li><a href="${base}/entries/${e.slug}">
      <span class="rv-topic">${escape(label)}</span>
      <span class="rv-title">${escape(e.title)}</span>
    </a></li>`;
  }).join('');
}

function init(): void {
  render();
  document.querySelector<HTMLButtonElement>('[data-rv-clear]')?.addEventListener('click', () => { clear(); render(); });
  document.querySelector<HTMLButtonElement>('[data-rv-dismiss]')?.addEventListener('click', () => {
    markHintDismissed();
    render();
  });
}

document.addEventListener('DOMContentLoaded', init);
if (document.readyState !== 'loading') init();
