#!/usr/bin/env node
/**
 * inpro ingest — fetch-first, Firecrawl-fallback.
 *
 * Reads scripts/targets.yml. For each kind:scrape target:
 *   - PDFs: download + pdftotext (always direct, never Firecrawl)
 *   - HTML: try direct fetch + html2text first; if empty/blocked, fall back to Firecrawl /v1/scrape
 * Writes to src/content/_raw/{tier}/{topic}/{host}--{slug}.md with the same frontmatter
 * schema as scrape.mjs so promote.mjs is compatible.
 *
 * Skips kind: crawl|map|search — those have no direct-fetch equivalent. Run scrape.mjs for those.
 *
 * Why: most T1 targets (home.army.mil, .gov PDFs) work via direct fetch and burn 0 Firecrawl credits.
 * Firecrawl is preserved for SPA targets (installations.militaryonesource.mil) and bot-blocked hosts.
 *
 * Env: FIRECRAWL_API_KEY  (required only if a target falls back to Firecrawl)
 *
 * Usage:
 *   node scripts/ingest.mjs                     # all kind:scrape targets
 *   node scripts/ingest.mjs --tier T1 --topic housing
 *   node scripts/ingest.mjs --only home.army.mil
 *   node scripts/ingest.mjs --dry-run           # list planned actions
 *   node scripts/ingest.mjs --skip-existing     # do not refetch existing raw files
 *   node scripts/ingest.mjs --limit 20          # cap targets processed
 *   node scripts/ingest.mjs --no-fallback       # never call Firecrawl; report failures only
 */

import fs from 'node:fs/promises';
import path from 'node:path';
import crypto from 'node:crypto';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import yaml from 'js-yaml';

const ROOT = path.resolve(fileURLToPath(import.meta.url), '../..');
const RAW_DIR = path.join(ROOT, 'src', 'content', '_raw');
const TMP_DIR = path.join(ROOT, '.cache', 'pdfs');
const TARGETS_PATH = path.join(ROOT, 'scripts', 'targets.yml');
const REPORT_PATH = path.join(ROOT, 'scripts', 'ingest-report.json');
const ERRORS_PATH = path.join(ROOT, 'scripts', 'ingest-errors.json');

const FIRECRAWL_BASE = process.env.FIRECRAWL_BASE_URL ?? 'https://api.firecrawl.dev';
const API_KEY = process.env.FIRECRAWL_API_KEY;
const UA = 'inpro-ingest/0.1 (+https://github.com/USAREUR-AF-ODT/inpro)';

const args = parseArgs(process.argv.slice(2));

function parseArgs(argv) {
  const out = {
    tier: null, topic: null, only: null, limit: null,
    dryRun: false, skipExisting: false, noFallback: false, force: false,
  };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--dry-run') out.dryRun = true;
    else if (a === '--tier') out.tier = argv[++i];
    else if (a === '--topic') out.topic = argv[++i];
    else if (a === '--only') out.only = argv[++i];
    else if (a === '--limit') out.limit = parseInt(argv[++i], 10);
    else if (a === '--skip-existing') out.skipExisting = true;
    else if (a === '--no-fallback') out.noFallback = true;
    else if (a === '--force') out.force = true;
    else if (a === '-h' || a === '--help') { printHelp(); process.exit(0); }
  }
  return out;
}

function printHelp() {
  console.log(`inpro ingest (fetch-first)
Usage: node scripts/ingest.mjs [flags]
  --tier T1|T2|T3|T4    filter by tier
  --topic <topic>       filter by topic
  --only <substring>    match against url
  --limit <n>           process at most N targets
  --skip-existing       do not refetch if raw file exists
  --no-fallback         never call Firecrawl; report failures
  --force               overwrite existing raw files
  --dry-run             list planned actions, skip fetch`);
}

// ─── Utilities (duplicated from scripts/scrape.mjs + fetch-html.mjs) ─────────
// TODO(dry): extract to scripts/lib/ when adding 4th consumer.

const now = () => new Date().toISOString().slice(0, 10);
const sha256 = (s) => crypto.createHash('sha256').update(s).digest('hex');
const sleep = (ms) => new Promise(r => setTimeout(r, ms));

function slugify(s) {
  return (s || '')
    .toLowerCase()
    .normalize('NFKD').replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 80);
}

function hostFromUrl(u) {
  try { return new URL(u).host.replace(/^www\./, ''); } catch { return 'unknown'; }
}

function targetPath(tier, topic, url) {
  const host = hostFromUrl(url);
  const pathPart = slugify(new URL(url).pathname || 'index') || 'index';
  return path.join(RAW_DIR, tier.toLowerCase(), topic, `${slugify(host)}--${pathPart}.md`);
}

function fmEscape(v) {
  if (v == null) return '';
  if (typeof v === 'string') return JSON.stringify(v);
  if (Array.isArray(v)) return '[' + v.map(fmEscape).join(', ') + ']';
  return JSON.stringify(v);
}

function toFrontmatter(obj) {
  const lines = ['---'];
  for (const [k, v] of Object.entries(obj)) {
    if (v === undefined || v === null) continue;
    lines.push(`${k}: ${fmEscape(v)}`);
  }
  lines.push('---\n');
  return lines.join('\n');
}

async function readExistingMeta(fp) {
  try {
    const text = await fs.readFile(fp, 'utf8');
    const m = text.match(/^---\n([\s\S]*?)\n---/);
    if (!m) return null;
    const meta = yaml.load(m[1]);
    return meta && typeof meta === 'object' ? meta : null;
  } catch { return null; }
}

// ─── Direct fetch path ───────────────────────────────────────────────────────

async function downloadHtml(url) {
  const ac = new AbortController();
  const t = setTimeout(() => ac.abort(), 30_000);
  try {
    const res = await fetch(url, {
      headers: {
        'User-Agent': UA,
        'Accept': 'text/html,application/xhtml+xml,*/*',
        'Accept-Language': 'en-US,en;q=0.9',
      },
      signal: ac.signal,
      redirect: 'follow',
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return await res.text();
  } finally { clearTimeout(t); }
}

function htmlToMarkdown(html) {
  return new Promise((resolve, reject) => {
    const child = spawn('html2text', ['-utf8', '-width', '100']);
    let out = '', err = '';
    child.stdout.on('data', (d) => { out += d.toString('utf8'); });
    child.stderr.on('data', (d) => { err += d.toString('utf8'); });
    child.on('close', (code) => {
      if (code !== 0) reject(new Error(`html2text exit ${code}: ${err}`));
      else resolve(out);
    });
    child.on('error', (e) => reject(new Error(`html2text spawn failed: ${e.message}`)));
    child.stdin.end(html);
  });
}

function extractTitle(html) {
  const m = html.match(/<title[^>]*>([^<]{1,200})<\/title>/i);
  return m ? m[1].trim().replace(/\s+/g, ' ') : 'Untitled';
}

async function downloadPdf(url, dest) {
  const res = await fetch(url, {
    headers: { 'User-Agent': UA, 'Accept': 'application/pdf,*/*' },
  });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const buf = Buffer.from(await res.arrayBuffer());
  await fs.writeFile(dest, buf);
  return buf.length;
}

function pdfToText(pdfPath) {
  return new Promise((resolve, reject) => {
    const child = spawn('pdftotext', ['-layout', '-nopgbrk', pdfPath, '-']);
    let out = '', err = '';
    child.stdout.on('data', (d) => { out += d.toString('utf8'); });
    child.stderr.on('data', (d) => { err += d.toString('utf8'); });
    child.on('close', (code) => {
      if (code !== 0) reject(new Error(`pdftotext exit ${code}: ${err}`));
      else resolve(out);
    });
    child.on('error', (e) => reject(new Error(`pdftotext spawn failed: ${e.message}`)));
  });
}

// ─── Firecrawl fallback (only when direct fetch yields empty/short content) ──

async function firecrawlScrape(url) {
  if (!API_KEY) throw new Error('FIRECRAWL_API_KEY not set; cannot fall back');
  const ac = new AbortController();
  const t = setTimeout(() => ac.abort(), 60_000);
  try {
    const res = await fetch(`${FIRECRAWL_BASE}/v1/scrape`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${API_KEY}`,
      },
      body: JSON.stringify({
        url,
        formats: ['markdown'],
        onlyMainContent: true,
        timeout: 30_000,
        waitFor: 1500,
        zeroDataRetention: true,
      }),
      signal: ac.signal,
    });
    if (!res.ok) throw new Error(`Firecrawl ${res.status}: ${(await res.text()).slice(0, 200)}`);
    const j = await res.json();
    const data = j?.data ?? j;
    return {
      markdown: data?.markdown ?? data?.content ?? '',
      title: data?.metadata?.title ?? data?.title ?? url,
    };
  } finally { clearTimeout(t); }
}

// ─── Persistence ─────────────────────────────────────────────────────────────

async function persist({ url, tier, topic, source, body, title }, counters) {
  const fp = targetPath(tier, topic, url);
  const hash = sha256(body);
  const existing = await readExistingMeta(fp);
  const firstScraped = existing?.first_scraped ?? now();

  const meta = {
    source_url: url,
    source_host: hostFromUrl(url),
    tier,
    topic,
    kind: source,
    title,
    first_scraped: firstScraped,
    last_scraped: now(),
    content_hash: hash,
    byte_count: body.length,
  };

  if (existing?.content_hash === hash) {
    meta.first_scraped = existing.first_scraped ?? firstScraped;
    counters.unchanged++;
  } else if (existing) {
    counters.changed++;
  } else {
    counters.new++;
  }

  await fs.mkdir(path.dirname(fp), { recursive: true });
  await fs.writeFile(fp, toFrontmatter(meta) + body.trim() + '\n', 'utf8');
}

// ─── Per-target dispatch ─────────────────────────────────────────────────────

async function ingestPdf(t, counters) {
  const dest = targetPath(t.tier, t.topic, t.url);
  if (args.skipExisting) {
    try { await fs.access(dest); counters.skipped++; return; } catch {}
  }
  const name = path.basename(new URL(t.url).pathname);
  const localPdf = path.join(TMP_DIR, `${Date.now()}--${name}`);
  await fs.mkdir(TMP_DIR, { recursive: true });
  const size = await downloadPdf(t.url, localPdf);
  const text = await pdfToText(localPdf);
  await fs.unlink(localPdf).catch(() => {});
  if (!text.trim()) { counters.empty++; return; }
  await persist({
    url: t.url, tier: t.tier, topic: t.topic, source: 'pdf-direct',
    body: text, title: t.notes || name,
  }, counters);
  counters.pdfBytes = (counters.pdfBytes ?? 0) + size;
}

async function ingestHtml(t, counters) {
  const dest = targetPath(t.tier, t.topic, t.url);
  if (args.skipExisting) {
    try { await fs.access(dest); counters.skipped++; return; } catch {}
  }

  let html, md, title, source;
  // 1) try direct fetch
  try {
    html = await downloadHtml(t.url);
    md = await htmlToMarkdown(html);
    title = extractTitle(html);
    source = 'html-direct';
  } catch (err) {
    if (args.noFallback) throw err;
    md = '';
  }

  // 2) fall back to Firecrawl if direct fetch yielded short/empty markdown
  if ((!md || md.trim().length < 200) && !args.noFallback) {
    counters.firecrawlCalls++;
    const fc = await firecrawlScrape(t.url);
    md = fc.markdown;
    title = fc.title;
    source = 'firecrawl-fallback';
  }

  if (!md || !md.trim()) { counters.empty++; return; }
  await persist({
    url: t.url, tier: t.tier, topic: t.topic, source,
    body: md, title: title || t.url,
  }, counters);
}

// ─── Main ────────────────────────────────────────────────────────────────────

async function main() {
  const raw = await fs.readFile(TARGETS_PATH, 'utf8');
  const all = yaml.load(raw);
  if (!Array.isArray(all)) throw new Error('targets.yml must be a list');

  let targets = all.filter(t => t.kind === 'scrape' && t.url);
  if (args.tier) targets = targets.filter(t => t.tier === args.tier);
  if (args.topic) targets = targets.filter(t => t.topic === args.topic);
  if (args.only) targets = targets.filter(t => t.url.toLowerCase().includes(args.only.toLowerCase()));
  if (args.limit) targets = targets.slice(0, args.limit);

  const skippedKinds = all.filter(t => t.kind && t.kind !== 'scrape').length;
  console.log(`inpro ingest — ${targets.length} kind:scrape targets after filters` +
    (skippedKinds ? ` (skipped ${skippedKinds} crawl/map/search — run scrape.mjs for those)` : ''));

  if (args.dryRun) {
    for (const t of targets) {
      const isPdf = /\.pdf$/i.test(new URL(t.url).pathname);
      console.log(`  [${isPdf ? 'pdf' : 'html'}] ${t.tier}/${t.topic}  ${t.url}`);
    }
    console.log('\nDry run — no fetches.');
    return;
  }

  const counters = { new: 0, changed: 0, unchanged: 0, empty: 0, failed: 0, skipped: 0, firecrawlCalls: 0 };
  const errors = [];

  for (let i = 0; i < targets.length; i++) {
    const t = targets[i];
    const isPdf = /\.pdf$/i.test(new URL(t.url).pathname);
    const label = `[${i + 1}/${targets.length}] ${t.tier}/${t.topic} ${t.url}`;
    process.stdout.write(`${label}\n`);
    try {
      if (isPdf) await ingestPdf(t, counters);
      else await ingestHtml(t, counters);
      process.stdout.write(`  ✓\n`);
    } catch (err) {
      counters.failed++;
      errors.push({ target: t, error: String(err?.message ?? err) });
      process.stdout.write(`  ✗ ${err.message}\n`);
    }
  }

  const report = {
    run_at: new Date().toISOString(),
    args: Object.fromEntries(Object.entries(args).filter(([, v]) => v != null && v !== false)),
    targets_total: all.length,
    targets_run: targets.length,
    counters,
    error_count: errors.length,
  };
  await fs.writeFile(REPORT_PATH, JSON.stringify(report, null, 2));
  if (errors.length) await fs.writeFile(ERRORS_PATH, JSON.stringify(errors, null, 2));

  console.log('\n── Summary ──');
  for (const [k, v] of Object.entries(counters)) console.log(`  ${k.padEnd(16)} ${v}`);
  console.log(`\nReport → scripts/ingest-report.json`);
  if (errors.length) console.log(`Errors → scripts/ingest-errors.json`);
  console.log(`Firecrawl credits used (fallback only): ${counters.firecrawlCalls}`);
}

main().catch(err => { console.error('Fatal:', err); process.exit(1); });
