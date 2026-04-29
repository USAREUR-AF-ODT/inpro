// Hydrate per-phase checklists. State persists in localStorage:
//   inpro.checklist.<phase>.v1 = string[] (slugs marked done)

const KEY_PREFIX = 'inpro.checklist.';

function key(phase: string): string {
  return `${KEY_PREFIX}${phase}.v1`;
}

function load(phase: string): Set<string> {
  try {
    const raw = localStorage.getItem(key(phase));
    if (!raw) return new Set();
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? new Set(parsed) : new Set();
  } catch { return new Set(); }
}

function save(phase: string, set: Set<string>): void {
  try { localStorage.setItem(key(phase), JSON.stringify([...set])); }
  catch { /* storage disabled */ }
}

function updateProgress(root: HTMLElement, total: number, done: number): void {
  const counter = root.querySelector<HTMLElement>('[data-cl-done]');
  if (counter) counter.textContent = String(done);
}

function init(): void {
  document.querySelectorAll<HTMLElement>('[data-cl-list]').forEach((list) => {
    const phase = list.getAttribute('data-phase') ?? '';
    if (!phase) return;
    const completed = load(phase);
    const items = Array.from(list.querySelectorAll<HTMLElement>('[data-cl-item]'));
    const total = items.length;

    const progressRoot = document.querySelector<HTMLElement>(`[data-cl-progress][data-phase="${phase}"]`);

    items.forEach((item) => {
      const slug = item.getAttribute('data-slug') ?? '';
      const check = item.querySelector<HTMLInputElement>('[data-cl-check]');
      if (!check) return;
      const initial = completed.has(slug);
      check.checked = initial;
      if (initial) item.classList.add('is-done');
      check.addEventListener('change', () => {
        if (check.checked) {
          completed.add(slug);
          item.classList.add('is-done');
        } else {
          completed.delete(slug);
          item.classList.remove('is-done');
        }
        save(phase, completed);
        if (progressRoot) updateProgress(progressRoot, total, completed.size);
      });
    });

    if (progressRoot) updateProgress(progressRoot, total, completed.size);
  });

  document.querySelectorAll<HTMLButtonElement>('[data-cl-reset]').forEach((btn) => {
    btn.addEventListener('click', () => {
      const phase = btn.getAttribute('data-phase') ?? '';
      if (!phase) return;
      if (!confirm(`Reset all "${phase}" checklist progress?`)) return;
      try { localStorage.removeItem(key(phase)); } catch { /* */ }
      // Re-init by reloading; simplest correct path
      location.reload();
    });
  });
}

document.addEventListener('DOMContentLoaded', init);
if (document.readyState !== 'loading') init();
