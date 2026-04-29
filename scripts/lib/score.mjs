/**
 * Source-credibility scoring rules. Pure helpers (no I/O) shared by
 * auto-score-sources.mjs and tests.
 *
 * Maps the existing T1-T4 tier shorthand into a 5-dimension auditable
 * scorecard: authority, currency, accuracy, purpose, license. See
 * src/content.config.ts sourceScore for the schema.
 */

const FEDERAL_CONTRACTED_HOSTS = new Set([
  'tricare-overseas.com', 'www.tricare-overseas.com',
  'milconnect.dmdc.osd.mil',
  'usaa.com', 'navyfederal.org',
]);

const PUBLIC_SERVICE_TIERS = new Set(['T1']);
const COMMERCIAL_ALIGNED_TIERS = new Set(['T2']);

const PUBLIC_DOMAIN_HOST_RE = /(?:^|\.)(?:army\.mil|af\.mil|navy\.mil|mil|gov|us)$/i;

/**
 * Score authority (1-5) based on tier + host.
 */
export function scoreAuthority(source) {
  const tier = source?.tier;
  let host = '';
  try { host = new URL(source.url).hostname.toLowerCase(); } catch { /* */ }
  if (tier === 'T1' && /\.(mil|gov)$/i.test(host)) return 5;
  // DoDEA schools are federal but use .edu TLD — explicit allowlist.
  if (tier === 'T1' && /\.dodea\.edu$/i.test(host)) return 5;
  if (tier === 'T1') return 4;
  if (FEDERAL_CONTRACTED_HOSTS.has(host)) return 4;
  if (tier === 'T2') return 4;
  if (tier === 'T4') return 2;
  if (tier === 'T3') return 1;
  return 3; // unknown
}

/**
 * Score currency (1-5) from last_verified date string.
 * Caller passes `today` for deterministic testing.
 */
export function scoreCurrency(lastVerified, today = new Date()) {
  if (!lastVerified) return 1;
  const t = new Date(lastVerified).getTime();
  if (Number.isNaN(t)) return 1;
  const days = Math.floor((today.getTime() - t) / 86400000);
  if (days <= 90) return 5;
  if (days <= 180) return 4;
  if (days <= 365) return 3;
  if (days <= 730) return 2;
  return 1;
}

/**
 * Score accuracy (1-5) from distinct host count across all sources of the entry.
 * 5 = ≥2 distinct hosts including T1; 3 = single T1; 1 = uncorroborated/no T1.
 */
export function scoreAccuracy(sources) {
  if (!sources?.length) return 1;
  const hosts = new Set();
  for (const s of sources) {
    try { hosts.add(new URL(s.url).hostname.replace(/^www\./, '')); } catch { /* */ }
  }
  const hasT1 = sources.some(s => s.tier === 'T1');
  if (hosts.size >= 2 && hasT1) return 5;
  if (hosts.size >= 2) return 4;
  if (hasT1) return 3;
  return 1;
}

/**
 * Score purpose/bias (1-5) from tier and host pattern.
 */
export function scorePurpose(source) {
  if (PUBLIC_SERVICE_TIERS.has(source?.tier)) return 5;
  if (COMMERCIAL_ALIGNED_TIERS.has(source?.tier)) return 3;
  if (source?.tier === 'T4') return 4; // foreign gov = public service in their context
  return 1; // T3 community / unknown
}

/**
 * Score license (1-5) from host pattern. .mil/.gov is public domain (17 USC 105).
 * Foreign gov = permissive cite. Everything else = link-only by default.
 */
export function scoreLicense(source) {
  let host = '';
  try { host = new URL(source.url).hostname.toLowerCase(); } catch { return 1; }
  if (/\.(mil|gov)$/i.test(host)) return 5;
  if (source?.tier === 'T4') return 3;
  if (source?.tier === 'T2') return 3;
  return 1;
}

/**
 * Score a source end-to-end. Currency requires entry-level last_verified;
 * accuracy requires the full sources[] array. So callers pass them in.
 */
export function scoreSource(source, { lastVerified, allSources, today } = {}) {
  return {
    authority: scoreAuthority(source),
    currency: scoreCurrency(lastVerified, today ?? new Date()),
    accuracy: scoreAccuracy(allSources ?? [source]),
    purpose: scorePurpose(source),
    license: scoreLicense(source),
  };
}
