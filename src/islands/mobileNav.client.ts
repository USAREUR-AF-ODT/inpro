const FOCUSABLE = 'a[href], button:not([disabled]), [tabindex]:not([tabindex="-1"])';

function setOpen(open: boolean): void {
  const toggle = document.querySelector<HTMLButtonElement>('[data-mobile-nav-open]');
  const panel = document.querySelector<HTMLElement>('#mobile-nav-panel');
  const backdrop = document.querySelector<HTMLElement>('[data-mobile-nav-backdrop]');
  if (!toggle || !panel || !backdrop) return;

  if (open) {
    panel.hidden = false;
    backdrop.hidden = false;
    requestAnimationFrame(() => {
      panel.setAttribute('data-visible', '');
      backdrop.setAttribute('data-visible', '');
    });
    toggle.setAttribute('aria-expanded', 'true');
    document.body.style.overflow = 'hidden';
    const first = panel.querySelector<HTMLElement>(FOCUSABLE);
    first?.focus();
  } else {
    panel.removeAttribute('data-visible');
    backdrop.removeAttribute('data-visible');
    toggle.setAttribute('aria-expanded', 'false');
    document.body.style.overflow = '';
    setTimeout(() => {
      if (toggle.getAttribute('aria-expanded') === 'false') {
        panel.hidden = true;
        backdrop.hidden = true;
      }
    }, 220);
    toggle.focus();
  }
}

function isOpen(): boolean {
  return document.querySelector('[data-mobile-nav-open]')?.getAttribute('aria-expanded') === 'true';
}

function onKey(e: KeyboardEvent): void {
  if (!isOpen()) return;
  if (e.key === 'Escape') {
    e.preventDefault();
    setOpen(false);
    return;
  }
  if (e.key !== 'Tab') return;
  const panel = document.querySelector<HTMLElement>('#mobile-nav-panel');
  if (!panel) return;
  const nodes = Array.from(panel.querySelectorAll<HTMLElement>(FOCUSABLE)).filter(n => !n.hasAttribute('disabled'));
  if (nodes.length === 0) return;
  const first = nodes[0];
  const last = nodes[nodes.length - 1];
  const active = document.activeElement as HTMLElement | null;
  if (e.shiftKey && active === first) {
    e.preventDefault();
    last.focus();
  } else if (!e.shiftKey && active === last) {
    e.preventDefault();
    first.focus();
  }
}

function markActiveLinks(): void {
  const path = location.pathname.replace(/\/$/, '');
  document.querySelectorAll<HTMLAnchorElement>('[data-mn-link]').forEach(a => {
    const href = a.getAttribute('href')?.replace(/\/$/, '') ?? '';
    if (href && path === href) a.setAttribute('aria-current', 'page');
  });
}

document.addEventListener('click', (e) => {
  const t = e.target as HTMLElement;
  if (t.closest('[data-mobile-nav-open]')) { setOpen(!isOpen()); return; }
  if (t.closest('[data-mobile-nav-close]')) { setOpen(false); return; }
  if (t.closest('[data-mobile-nav-backdrop]')) { setOpen(false); return; }
  if (t.closest('[data-mn-link]') && isOpen()) setOpen(false);
});

document.addEventListener('keydown', onKey);
document.addEventListener('DOMContentLoaded', markActiveLinks);
if (document.readyState !== 'loading') markActiveLinks();
