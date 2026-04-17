const base = (document.querySelector<HTMLMetaElement>('meta[name="inpro-base"]')?.content ?? '').replace(/\/$/, '');

function isTypingTarget(el: EventTarget | null): boolean {
  if (!(el instanceof HTMLElement)) return false;
  if (el.isContentEditable) return true;
  const tag = el.tagName;
  return tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT';
}

function closeOverlay(): void {
  const o = document.querySelector<HTMLElement>('[data-shortcuts-overlay]');
  if (o) o.hidden = true;
}

function openOverlay(): void {
  const o = document.querySelector<HTMLElement>('[data-shortcuts-overlay]');
  if (o) o.hidden = false;
}

function toggleOverlay(): void {
  const o = document.querySelector<HTMLElement>('[data-shortcuts-overlay]');
  if (!o) return;
  o.hidden = !o.hidden;
}

function gotoSearch(): void {
  const here = location.pathname.replace(/\/$/, '');
  const target = `${base}/search`;
  if (here === target) {
    const input = document.querySelector<HTMLInputElement>('.pagefind-ui__search-input');
    if (input) { input.focus(); return; }
  }
  location.href = target;
}

function gotoHome(): void {
  location.href = `${base}/`;
}

let pendingG = false;
let pendingGTimer: number | null = null;

function handle(e: KeyboardEvent): void {
  if (e.defaultPrevented) return;
  if (e.metaKey || e.ctrlKey || e.altKey) return;
  if (isTypingTarget(e.target)) return;

  if (e.key === 'Escape') {
    const o = document.querySelector<HTMLElement>('[data-shortcuts-overlay]');
    if (o && !o.hidden) {
      closeOverlay();
      e.preventDefault();
    }
    pendingG = false;
    return;
  }

  if (pendingG) {
    if (e.key === 'h') { e.preventDefault(); pendingG = false; gotoHome(); return; }
    if (e.key === 's') { e.preventDefault(); pendingG = false; gotoSearch(); return; }
    pendingG = false;
  }

  if (e.key === 'g') {
    pendingG = true;
    if (pendingGTimer) clearTimeout(pendingGTimer);
    pendingGTimer = window.setTimeout(() => { pendingG = false; }, 1200);
    return;
  }

  if (e.key === '?') {
    e.preventDefault();
    toggleOverlay();
    return;
  }
}

document.addEventListener('keydown', handle);

document.addEventListener('click', (e) => {
  const t = e.target as HTMLElement;
  if (t.closest('[data-shortcuts-close]')) closeOverlay();
  const overlay = t.closest<HTMLElement>('[data-shortcuts-overlay]');
  if (overlay && t === overlay) closeOverlay();
});
