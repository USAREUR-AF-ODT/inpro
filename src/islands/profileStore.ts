import type { Profile } from '../lib/matchProfile';

const KEY = 'inpro.profile.v1';
const BANNER_KEY = 'inpro.seenBanner.v1';
const SESSION_SHOW_ALL_KEY = 'inpro.sessionShowAll.v1';

type Listener = (p: Profile | null) => void;
const listeners = new Set<Listener>();

export function load(): Profile | null {
  try {
    const raw = localStorage.getItem(KEY);
    return raw ? JSON.parse(raw) as Profile : null;
  } catch { return null; }
}

export function save(p: Profile | null): void {
  try {
    if (p === null) localStorage.removeItem(KEY);
    else localStorage.setItem(KEY, JSON.stringify(p));
  } catch { /* storage disabled — ignore */ }
  listeners.forEach(fn => fn(p));
  window.dispatchEvent(new CustomEvent('inpro:profile-change', { detail: p }));
}

export function subscribe(fn: Listener): () => void {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

export function hasSeenBanner(): boolean {
  try { return localStorage.getItem(BANNER_KEY) === '1'; } catch { return true; }
}

export function markBannerSeen(): void {
  try { localStorage.setItem(BANNER_KEY, '1'); } catch { /* ignore */ }
}

export function getSessionShowAll(): boolean {
  try { return sessionStorage.getItem(SESSION_SHOW_ALL_KEY) === '1'; } catch { return false; }
}

export function setSessionShowAll(v: boolean): void {
  try {
    if (v) sessionStorage.setItem(SESSION_SHOW_ALL_KEY, '1');
    else sessionStorage.removeItem(SESSION_SHOW_ALL_KEY);
  } catch { /* ignore */ }
  window.dispatchEvent(new CustomEvent('inpro:profile-change', { detail: load() }));
}

export function summary(p: Profile | null): string {
  if (!p) return 'Set your view';
  if (p.showAll) return 'Showing everything';
  const parts: string[] = [];
  if (p.rank && p.rank !== 'any') parts.push(p.rank);
  if (p.status && p.status !== 'any') {
    const map: Record<string, string> = {
      soldier: 'Soldier', daciv: 'DA Civ', contractor: 'Contractor', family: 'Family',
    };
    parts.push(map[p.status] ?? p.status);
  }
  if (p.has_kids === 'yes') parts.push('+kids');
  if (p.has_pets === 'yes') parts.push('+pets');
  if (p.has_pov === 'yes') parts.push('+POV');
  return parts.join(' · ') || 'Set your view';
}
