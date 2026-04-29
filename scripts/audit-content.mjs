#!/usr/bin/env node
/**
 * Content quality lint. Walks src/content/published/**.md and reports:
 *   - missing required frontmatter
 *   - tier-aware staleness: STALE_SAFETY (default 60d) for medical/legal/finance/id-cac, STALE_OTHER (default 90d) elsewhere
 *   - safety topics missing a T1 source
 *   - poc_volatile: true with last_verified older than POC_STALE (default 30d)
 *   - poc_volatile: true without at least one T1 source
 *   - invalid topic/phase enums
 *   - broken internal links to /entries/ and /topics/
 *   - PII baseline (SSN-like, DODID-like with context, personal-email domains)
 *
 * Exit code 1 if any blocker; warnings only otherwise.
 *
 *   node scripts/audit-content.mjs              # run
 *   node scripts/audit-content.mjs --json       # machine-readable
 *   STALE_SAFETY=30 node scripts/audit-content.mjs
 */

import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import yaml from 'js-yaml';

const ROOT = path.resolve(fileURLToPath(import.meta.url), '../..');
const PUB = path.join(ROOT, 'src', 'content', 'published');
const STALE_SAFETY = Number(process.env.STALE_SAFETY ?? 60);
const STALE_OTHER = Number(process.env.STALE_OTHER ?? 90);
const POC_STALE = Number(process.env.POC_STALE ?? 30);
const SITE_BASE = (process.env.SITE_BASE ?? '/inpro').replace(/\/$/, '');

const SAFETY_TOPICS = new Set(['medical', 'legal', 'finance', 'id-cac']);
const TOPICS = ['housing','finance','medical','legal','vehicle','id-cac','family','schools','pets','religious','mwr','unit'];
const PHASES = ['before','arrive','settle','life','sponsors'];

const PERSONAL_EMAIL_DOMAINS = new Set([
  'gmail.com', 'yahoo.com', 'outlook.com', 'hotmail.com',
  'aol.com', 'icloud.com', 'me.com', 'mac.com',
  'proton.me', 'protonmail.com', 'pm.me',
  'gmx.com', 'gmx.de', 'web.de', 't-online.de',
]);

const SSN_RE = /(?<![\d-])\d{3}-\d{2}-\d{4}(?![\d-])/g;
const DODID_RE = /\b(?:DODID|EDIPI|DOD\s*ID)\b[^\n]{0,40}?(\d{10})\b/gi;
const PHONE_HINT_RE = /(?:phone|tel|fax|dsn|hotline|kontakt)[^\n]{0,12}/i;
// US passport: one letter + 8 digits, OR 9 digits (book-style). Require the literal
// token to avoid false positives on tracking numbers.
const PASSPORT_RE = /\bpassport\s*(?:no\.?|number|#)?\s*[:#]?\s*([A-Z]\d{8}|\d{9})\b/gi;
// Banned classification / OPSEC strings. Should never appear in published content.
const BANNED_STRINGS = [
  '\\bSECRET\\b',
  '\\bTOP\\s+SECRET\\b',
  '\\bCONFIDENTIAL\\b',
  '\\bCUI//[A-Z]+',
  '\\bNOFORN\\b',
  '\\bFOUO\\b',
  '\\bORCON\\b',
  '\\bOPDATA\\b',
];
const BANNED_RE = new RegExp(`(?:${BANNED_STRINGS.join('|')})`, 'g');

function checkOpsec(fm, body, issues, rel) {
  // Scan body for SSN-like patterns. Skip lines with phone/dsn context.
  for (const line of body.split('\n')) {
    if (PHONE_HINT_RE.test(line)) continue;
    for (const m of line.matchAll(SSN_RE)) {
      issues.push({ file: rel, level: 'error', msg: `OPSEC: SSN-like pattern "${m[0]}"` });
    }
  }

  // DODID requires the literal token nearby to avoid false positives on phone numbers.
  for (const m of body.matchAll(DODID_RE)) {
    issues.push({ file: rel, level: 'error', msg: `OPSEC: DODID/EDIPI followed by 10-digit "${m[1]}"` });
  }

  // US passport number near the literal "passport" keyword.
  for (const m of body.matchAll(PASSPORT_RE)) {
    issues.push({ file: rel, level: 'error', msg: `OPSEC: passport-number-shaped value near "passport" keyword "${m[1]}"` });
  }

  // Banned classification / handling-caveat strings.
  for (const m of body.matchAll(BANNED_RE)) {
    issues.push({ file: rel, level: 'error', msg: `OPSEC: banned classification string "${m[0]}"` });
  }

  // Personal email domains in POC contacts.
  for (const poc of fm.poc ?? []) {
    if (!poc.email) continue;
    const domain = String(poc.email).split('@').pop()?.toLowerCase();
    if (domain && PERSONAL_EMAIL_DOMAINS.has(domain)) {
      issues.push({ file: rel, level: 'warn', msg: `OPSEC: personal-email domain in POC "${poc.email}"` });
    }
  }

  // Personal email domains in source URLs (T3 community, T4 German). T1/T2 should be official; flag if any.
  for (const src of fm.sources ?? []) {
    try {
      const host = new URL(src.url).hostname.toLowerCase();
      const apex = host.split('.').slice(-2).join('.');
      if (PERSONAL_EMAIL_DOMAINS.has(apex)) {
        issues.push({ file: rel, level: 'warn', msg: `OPSEC: personal domain as source "${src.url}"` });
      }
    } catch { /* ignore unparseable */ }
  }
}

async function* walk(dir) {
  const entries = await fs.readdir(dir, { withFileTypes: true });
  for (const e of entries) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) yield* walk(p);
    else if (e.name.endsWith('.md')) yield p;
  }
}

function parseFm(text) {
  const m = text.match(/^---\n([\s\S]*?)\n---/);
  if (!m) return null;
  try { return yaml.load(m[1]); } catch { return null; }
}

// Match markdown links: [text](url). Excludes inline images and reference-style.
const MD_LINK_RE = /\[[^\]]*\]\(([^)\s]+)(?:\s+"[^"]*")?\)/g;

function slugFromFile(fp) {
  // src/content/published/<topic>/<slug>.md  ->  <topic>/<slug>
  const rel = path.relative(PUB, fp).replace(/\\/g, '/');
  return rel.replace(/\.md$/, '');
}

function checkInternalLinks(body, issues, rel, slugSet) {
  for (const m of body.matchAll(MD_LINK_RE)) {
    let url = m[1];
    if (!url) continue;
    // Skip mailto:, tel:, fragments, external (http://, https://), data:
    if (/^(?:[a-z][a-z0-9+.-]*:|#)/i.test(url)) continue;

    // Strip fragment + query for the lookup
    url = url.split('#')[0].split('?')[0];
    if (!url) continue;

    // Strip optional base prefix
    if (SITE_BASE && url.startsWith(SITE_BASE + '/')) url = url.slice(SITE_BASE.length);

    const entryMatch = url.match(/^\/entries\/(.+?)\/?$/);
    if (entryMatch) {
      const slug = entryMatch[1];
      if (!slugSet.has(slug)) {
        issues.push({ file: rel, level: 'warn', msg: `broken internal link: /entries/${slug}` });
      }
      continue;
    }

    const topicMatch = url.match(/^\/topics\/([^/]+)\/?$/);
    if (topicMatch) {
      const topic = topicMatch[1];
      if (!TOPICS.includes(topic)) {
        issues.push({ file: rel, level: 'warn', msg: `broken topic link: /topics/${topic}` });
      }
      continue;
    }

    const phaseMatch = url.match(/^\/([^/]+)\/?$/);
    if (phaseMatch && PHASES.includes(phaseMatch[1])) continue;
  }
}

async function main() {
  const issues = [];
  let count = 0;

  try { await fs.access(PUB); } catch {
    console.log('No published content yet.');
    return;
  }

  // First pass: build slug set for internal-link integrity check.
  const slugSet = new Set();
  for await (const fp of walk(PUB)) slugSet.add(slugFromFile(fp));

  for await (const fp of walk(PUB)) {
    count++;
    const rel = path.relative(ROOT, fp);
    const text = await fs.readFile(fp, 'utf8');
    const fm = parseFm(text);
    if (!fm) { issues.push({ file: rel, level: 'error', msg: 'missing frontmatter' }); continue; }

    for (const req of ['title', 'summary', 'topic', 'phase', 'last_verified']) {
      if (!fm[req]) issues.push({ file: rel, level: 'error', msg: `missing field: ${req}` });
    }

    if (fm.topic && !TOPICS.includes(fm.topic)) {
      issues.push({ file: rel, level: 'error', msg: `invalid topic: ${fm.topic}` });
    }
    if (fm.phase && !PHASES.includes(fm.phase)) {
      issues.push({ file: rel, level: 'error', msg: `invalid phase: ${fm.phase}` });
    }

    const isSafety = fm.topic && SAFETY_TOPICS.has(fm.topic);
    const staleThreshold = isSafety ? STALE_SAFETY : STALE_OTHER;

    if (fm.last_verified) {
      const age = Math.floor((Date.now() - new Date(fm.last_verified).getTime()) / 86400000);
      if (age > staleThreshold) {
        const tier = isSafety ? 'safety-topic' : 'general';
        issues.push({ file: rel, level: 'warn', msg: `stale: last_verified ${age}d ago (>${staleThreshold}, ${tier})` });
      }
      if (fm.poc_volatile && age > POC_STALE) {
        issues.push({ file: rel, level: 'warn', msg: `poc_volatile and last_verified ${age}d ago (>${POC_STALE})` });
      }
    }

    if (isSafety && !fm.stub) {
      const sources = fm.sources ?? [];
      const tiers = sources.map(s => s.tier);
      const hasT1 = tiers.includes('T1');
      // German-side legal entries (e.g., Rundfunkbeitrag, Hessen holidays) cite T4 only by nature.
      // Treat "legal" with no T1 but all-T4 sources as a German-side entry, exempt from the T1 rule.
      const isGermanSideLegal = fm.topic === 'legal' && tiers.length > 0 && tiers.every(t => t === 'T4');
      if (!hasT1 && !isGermanSideLegal) {
        issues.push({ file: rel, level: 'warn', msg: `safety topic "${fm.topic}" missing T1 source` });
      }
      // Multi-host requirement: safety topics should not depend on a single host. Single-host
      // sources are a freshness time bomb when that host reorganizes. Cap on home.army.mil
      // dominance was 80% across the corpus; force diversity entry-by-entry going forward.
      const hosts = new Set();
      for (const s of sources) {
        try { hosts.add(new URL(s.url).hostname.replace(/^www\./, '')); } catch { /* skip unparseable */ }
      }
      if (sources.length >= 1 && hosts.size < 2 && !isGermanSideLegal) {
        issues.push({ file: rel, level: 'warn', msg: `safety topic "${fm.topic}" cites only ${hosts.size} host(s) — diversify to ≥2 distinct hosts` });
      }
    }

    if (fm.poc_volatile) {
      const t1 = (fm.sources ?? []).some(s => s.tier === 'T1');
      if (!t1) issues.push({ file: rel, level: 'warn', msg: 'poc_volatile but no T1 source cited' });
    }

    if (fm.summary && fm.summary.length > 280) {
      issues.push({ file: rel, level: 'warn', msg: `summary ${fm.summary.length} chars (>280)` });
    }

    // M-prose-03 (2026-04-25): block em/en dashes per CONTENT_STYLE.md.
    // Skip frontmatter (we already extracted it via parseFm) and only scan body.
    const fmEnd = text.indexOf('\n---', 4);
    const body = fmEnd === -1 ? text : text.slice(fmEnd + '\n---'.length);
    const dashHits = body.match(/[—–]/g);
    if (dashHits && dashHits.length) {
      issues.push({ file: rel, level: 'error', msg: `${dashHits.length} em/en-dash(es) — replace per CONTENT_STYLE.md` });
    }

    checkOpsec(fm, body, issues, rel);
    checkInternalLinks(body, issues, rel, slugSet);
  }

  if (process.argv.includes('--json')) {
    console.log(JSON.stringify({
      count,
      issues,
      thresholds: { stale_safety: STALE_SAFETY, stale_other: STALE_OTHER, poc_stale: POC_STALE },
    }, null, 2));
  } else {
    console.log(`Audited ${count} published entries.`);
    if (issues.length === 0) {
      console.log('No issues.');
    } else {
      for (const i of issues) console.log(`  [${i.level}] ${i.file} — ${i.msg}`);
    }
  }

  const errors = issues.filter(i => i.level === 'error');
  if (errors.length) process.exit(1);
}

main().catch(err => { console.error(err); process.exit(1); });
