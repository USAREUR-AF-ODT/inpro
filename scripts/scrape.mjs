#!/usr/bin/env node
/**
 * inpro scraper — Firecrawl orchestrator.
 *
 * Reads scripts/targets.yml, dispatches to Firecrawl (/scrape, /crawl, /map, /search),
 * writes markdown + frontmatter to src/content/raw/{tier}/{topic}/{host}--{slug}.md.
 *
 * Idempotent: dedupes by content-hash; unchanged files get only last_scraped bumped.
 *
 * Env: FIRECRAWL_API_KEY  (required)
 * Usage:
 *   node scripts/scrape.mjs
 *   node scripts/scrape.mjs --tier T1 --topic housing
 *   node scripts/scrape.mjs --kind scrape
 *   node scripts/scrape.mjs --only home.army.mil
 *   node scripts/scrape.mjs --dry-run
 *   node scripts/scrape.mjs --limit 5       # cap targets processed
 */

import fs from 'node:fs/promises';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';
import yaml from 'js-yaml';

const ROOT = path.resolve(fileURLToPath(import.meta.url), '../..');
const RAW_DIR = path.join(ROOT, 'src', 'content', '_raw');
const TARGETS_PATH = path.join(ROOT, 'scripts', 'targets.yml');
const REPORT_PATH = path.join(ROOT, 'scripts', 'scrape-report.json');
const ERROR_PATH = path.join(ROOT, 'scripts', 'scrape-errors.json');

const FIRECRAWL_BASE = process.env.FIRECRAWL_BASE_URL ?? 'https://api.firecrawl.dev';
const API_KEY = process.env.FIRECRAWL_API_KEY;

// ─── CLI args ────────────────────────────────────────────────────────────────

const args = parseArgs(process.argv.slice(2));

function parseArgs(argv) {
  const out = {
    tier: null, topic: null, kind: null, only: null, limit: null,
    dryRun: false, rateMs: 400, concurrency: 3,
    skipExisting: false, force: false,
  };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--dry-run') out.dryRun = true;
    else if (a === '--tier') out.tier = argv[++i];
    else if (a === '--topic') out.topic = argv[++i];
    else if (a === '--kind') out.kind = argv[++i];
    else if (a === '--only') out.only = argv[++i];
    else if (a === '--limit') out.limit = parseInt(argv[++i], 10);
    else if (a === '--rate-ms') out.rateMs = parseInt(argv[++i], 10);
    else if (a === '--concurrency' || a === '-j') out.concurrency = parseInt(argv[++i], 10);
    else if (a === '--skip-existing') out.skipExisting = true;
    else if (a === '--force') out.force = true;
    else if (a === '-h' || a === '--help') { printHelp(); process.exit(0); }
  }
  return out;
}

function printHelp() {
  console.log(`inpro scraper
Usage: node scripts/scrape.mjs [flags]
  --tier T1|T2|T3|T4      filter by tier
  --topic <topic>         filter by topic (housing, finance, ...)
  --kind scrape|crawl|map|search
  --only <substring>      match against url/query
  --limit <n>             process at most N targets
  --rate-ms <n>           delay between API calls (default 700)
  --dry-run               list planned actions, skip API`);
}

// ─── Utilities ───────────────────────────────────────────────────────────────

const now = () => new Date().toISOString().slice(0, 10);
const sleep = (ms) => new Promise(r => setTimeout(r, ms));

function sha256(str) {
  return crypto.createHash('sha256').update(str).digest('hex');
}

function slugify(s) {
  return (s || '')
    .toLowerCase()
    .normalize('NFKD').replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 80);
}

function hostFromUrl(u) {
  try { return new URL(u).host.replace(/^www\./, ''); } catch { return 'unknown'; }
}

function targetPath(tier, topic, url, titleHint) {
  const host = hostFromUrl(url);
  const pathPart = slugify(new URL(url).pathname || titleHint || 'index') || 'index';
  return path.join(RAW_DIR, tier.toLowerCase(), topic, `${slugify(host)}--${pathPart}.md`);
}

async function ensureDir(p) {
  await fs.mkdir(path.dirname(p), { recursive: true });
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

async function writeEntry(fp, meta, body) {
  await ensureDir(fp);
  const out = toFrontmatter(meta) + body.trim() + '\n';
  await fs.writeFile(fp, out, 'utf8');
}

// ─── Firecrawl calls with retry ──────────────────────────────────────────────

async function fc(endpoint, payload, { retries = 2, backoffMs = 1500, timeoutMs = 90_000 } = {}) {
  if (!API_KEY) throw new Error('FIRECRAWL_API_KEY is not set');
  const url = `${FIRECRAWL_BASE}${endpoint}`;
  let lastErr;
  for (let attempt = 0; attempt < retries; attempt++) {
    const ac = new AbortController();
    const timer = setTimeout(() => ac.abort(new Error(`client-side timeout ${timeoutMs}ms`)), timeoutMs);
    try {
      const res = await fetch(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${API_KEY}`,
        },
        body: JSON.stringify(payload),
        signal: ac.signal,
      });
      clearTimeout(timer);
      if (res.status === 429) {
        const wait = backoffMs * Math.pow(2, attempt);
        console.warn(`  rate-limited, sleeping ${wait}ms`);
        await sleep(wait);
        continue;
      }
      // Firecrawl returns 408 for page timeouts — don't bother retrying, the server already tried
      if (res.status === 408) {
        const text = await res.text();
        throw new Error(`PAGE_TIMEOUT ${res.status}: ${text.slice(0, 200)}`);
      }
      if (!res.ok) {
        const text = await res.text();
        throw new Error(`Firecrawl ${endpoint} ${res.status}: ${text.slice(0, 300)}`);
      }
      return await res.json();
    } catch (err) {
      clearTimeout(timer);
      lastErr = err;
      // Skip retry on PAGE_TIMEOUT — same page will time out again
      if (String(err?.message ?? '').startsWith('PAGE_TIMEOUT')) break;
      if (attempt < retries - 1) {
        const wait = backoffMs * Math.pow(2, attempt);
        console.warn(`  attempt ${attempt + 1} failed: ${err.message}; retry in ${wait}ms`);
        await sleep(wait);
      }
    }
  }
  throw lastErr;
}

async function fcGet(endpoint, { retries = 3, backoffMs = 1500, timeoutMs = 60_000 } = {}) {
  if (!API_KEY) throw new Error('FIRECRAWL_API_KEY is not set');
  const url = `${FIRECRAWL_BASE}${endpoint}`;
  let lastErr;
  for (let attempt = 0; attempt < retries; attempt++) {
    const ac = new AbortController();
    const timer = setTimeout(() => ac.abort(new Error(`timeout ${timeoutMs}ms`)), timeoutMs);
    try {
      const res = await fetch(url, {
        headers: { 'Authorization': `Bearer ${API_KEY}` },
        signal: ac.signal,
      });
      clearTimeout(timer);
      if (!res.ok) {
        const text = await res.text();
        throw new Error(`Firecrawl ${endpoint} ${res.status}: ${text.slice(0, 300)}`);
      }
      return await res.json();
    } catch (err) {
      clearTimeout(timer);
      lastErr = err;
      if (attempt < retries - 1) await sleep(backoffMs * Math.pow(2, attempt));
    }
  }
  throw lastErr;
}

// ─── Target dispatchers ──────────────────────────────────────────────────────

async function doScrape(target, counters) {
  const { url, tier, topic } = target;
  // Skip-existing: if we already have a raw file for this URL and --skip-existing, skip.
  if (args.skipExisting) {
    const fp = targetPath(tier, topic, url);
    try {
      await fs.access(fp);
      counters.unchanged++;
      return;
    } catch { /* no file — proceed */ }
  }
  const isPdf = /\.pdf$/i.test(new URL(url).pathname);
  const payload = {
    url,
    formats: ['markdown'],
    onlyMainContent: true,
    timeout: isPdf ? 120_000 : 30_000,   // Firecrawl server-side timeout
    waitFor: isPdf ? 0 : 1500,
  };
  const clientTimeoutMs = isPdf ? 180_000 : 60_000;
  const res = await fc('/v1/scrape', payload, { timeoutMs: clientTimeoutMs });
  const data = res?.data ?? res;
  const markdown = data?.markdown ?? data?.content ?? '';
  const title = data?.metadata?.title ?? data?.title ?? url;
  if (!markdown.trim()) {
    counters.empty++;
    console.warn(`  empty markdown for ${url}`);
    return;
  }
  await persist({ url, tier, topic, kind: 'scrape', markdown, title }, counters);
}

async function doMap(target, counters) {
  const { url, tier, topic, limit = 100 } = target;
  const res = await fc('/v1/map', { url, limit });
  const urls = res?.links ?? res?.data?.links ?? [];
  console.log(`  map discovered ${urls.length} links for ${url}`);
  // Write a simple index file listing discovered URLs — scraping them is a second pass.
  const body = urls.map(u => `- ${u}`).join('\n');
  const indexPath = path.join(RAW_DIR, tier.toLowerCase(), topic, `_map--${slugify(hostFromUrl(url))}.md`);
  await ensureDir(indexPath);
  const meta = {
    source_url: url,
    tier,
    topic,
    kind: 'map',
    title: `Site map: ${hostFromUrl(url)}`,
    first_scraped: now(),
    last_scraped: now(),
    link_count: urls.length,
  };
  await writeEntry(indexPath, meta, `# Discovered URLs\n\n${body}\n`);
  counters.maps++;
}

async function doCrawl(target, counters) {
  const { url, tier, topic, limit = 30, includePaths, excludePaths } = target;
  const payload = {
    url,
    limit,
    scrapeOptions: { formats: ['markdown'], onlyMainContent: true },
  };
  if (includePaths) payload.includePaths = includePaths;
  if (excludePaths) payload.excludePaths = excludePaths;

  const start = await fc('/v1/crawl', payload);
  const jobId = start?.id ?? start?.jobId;
  if (!jobId) {
    console.warn(`  crawl did not return job id for ${url}`, start);
    counters.failed++;
    return;
  }
  console.log(`  crawl job ${jobId} started; polling...`);

  const deadline = Date.now() + 5 * 60 * 1000; // 5 min cap
  let status = 'scraping';
  let results = [];
  while (Date.now() < deadline && status !== 'completed' && status !== 'failed') {
    await sleep(4000);
    const poll = await fcGet(`/v1/crawl/${jobId}`);
    status = poll?.status ?? 'unknown';
    results = poll?.data ?? results;
    process.stdout.write(`    status=${status} fetched=${results.length}\r`);
    if (status === 'failed') {
      console.warn(`\n  crawl failed: ${JSON.stringify(poll?.error ?? {})}`);
      counters.failed++;
      return;
    }
  }
  console.log();
  if (status !== 'completed' && results.length === 0) {
    console.warn(`  crawl timed out or empty for ${url}`);
    counters.failed++;
    return;
  }

  for (const item of results) {
    const md = item?.markdown ?? item?.content ?? '';
    const itemUrl = item?.metadata?.sourceURL ?? item?.url ?? url;
    const itemTitle = item?.metadata?.title ?? item?.title ?? itemUrl;
    if (!md.trim()) { counters.empty++; continue; }
    await persist({ url: itemUrl, tier, topic, kind: 'crawl', markdown: md, title: itemTitle }, counters);
  }
}

async function doSearch(target, counters) {
  const { query, tier, topic, limit = 10 } = target;
  const res = await fc('/v1/search', {
    query,
    limit,
    scrapeOptions: { formats: ['markdown'], onlyMainContent: true },
  });
  const hits = res?.data ?? res?.results ?? [];
  console.log(`  search "${query}" returned ${hits.length} hits`);
  for (const h of hits) {
    const md = h?.markdown ?? h?.content ?? '';
    const hUrl = h?.url ?? h?.metadata?.sourceURL;
    const hTitle = h?.title ?? h?.metadata?.title ?? hUrl;
    if (!md || !md.trim() || !hUrl) { counters.empty++; continue; }
    await persist({ url: hUrl, tier, topic, kind: 'search', markdown: md, title: hTitle, query }, counters);
  }
}

async function persist({ url, tier, topic, kind, markdown, title, query }, counters) {
  const fp = targetPath(tier, topic, url, title);
  const hash = sha256(markdown);
  const existing = await readExistingMeta(fp);
  const firstScraped = existing?.first_scraped ?? now();
  const meta = {
    source_url: url,
    source_host: hostFromUrl(url),
    tier,
    topic,
    kind,
    title,
    query: query || undefined,
    first_scraped: firstScraped,
    last_scraped: now(),
    content_hash: hash,
    byte_count: markdown.length,
  };

  if (existing?.content_hash === hash) {
    // bump last_scraped only
    meta.first_scraped = existing.first_scraped ?? firstScraped;
    await writeEntry(fp, meta, markdown);
    counters.unchanged++;
    return;
  }
  if (existing) counters.changed++;
  else counters.new++;
  await writeEntry(fp, meta, markdown);
}

// ─── Main orchestration ──────────────────────────────────────────────────────

async function main() {
  const raw = await fs.readFile(TARGETS_PATH, 'utf8');
  const targets = yaml.load(raw);
  if (!Array.isArray(targets)) {
    throw new Error('targets.yml must be a list');
  }

  let filtered = targets.filter(t => {
    if (args.tier && t.tier !== args.tier) return false;
    if (args.topic && t.topic !== args.topic) return false;
    if (args.kind && t.kind !== args.kind) return false;
    if (args.only) {
      const hay = `${t.url ?? ''} ${t.query ?? ''}`.toLowerCase();
      if (!hay.includes(args.only.toLowerCase())) return false;
    }
    return true;
  });
  if (args.limit) filtered = filtered.slice(0, args.limit);

  console.log(`inpro scraper — ${filtered.length}/${targets.length} targets after filters`);
  if (args.dryRun) {
    for (const t of filtered) {
      console.log(`  [${t.kind}] ${t.tier}/${t.topic}  ${t.url ?? t.query}`);
    }
    console.log('\nDry run — no API calls made.');
    return;
  }
  if (!API_KEY) {
    console.error('ERROR: FIRECRAWL_API_KEY not set. export FIRECRAWL_API_KEY=...');
    process.exit(1);
  }

  const counters = { new: 0, changed: 0, unchanged: 0, empty: 0, failed: 0, maps: 0 };
  const errors = [];

  // Split targets: crawls run serially (they're long-running jobs);
  // scrape/map/search parallelize well.
  const heavy = filtered.filter(t => t.kind === 'crawl');
  const light = filtered.filter(t => t.kind !== 'crawl');

  async function runOne(t, idx, total) {
    const label = t.url ?? t.query;
    const line = `[${idx}/${total}] ${t.kind} ${t.tier}/${t.topic} ${label}`;
    process.stdout.write(line + '\n');
    try {
      switch (t.kind) {
        case 'scrape': await doScrape(t, counters); break;
        case 'crawl':  await doCrawl(t, counters); break;
        case 'map':    await doMap(t, counters); break;
        case 'search': await doSearch(t, counters); break;
        default: throw new Error(`unknown kind: ${t.kind}`);
      }
      process.stdout.write(`  ✓ ${label}\n`);
    } catch (err) {
      counters.failed++;
      errors.push({ target: t, error: String(err?.message ?? err) });
      process.stdout.write(`  ✗ ${label}: ${err.message}\n`);
    }
  }

  // Parallel worker pool for light targets
  const n = args.concurrency;
  console.log(`Running ${light.length} light targets with concurrency=${n}...`);
  let cursor = 0;
  const total = filtered.length;
  async function worker() {
    while (true) {
      const i = cursor++;
      if (i >= light.length) return;
      await runOne(light[i], i + 1, total);
      if (args.rateMs) await sleep(args.rateMs);
    }
  }
  await Promise.all(Array.from({ length: n }, () => worker()));

  // Heavy (crawl) targets: serial, always one at a time
  for (let i = 0; i < heavy.length; i++) {
    await runOne(heavy[i], light.length + i + 1, total);
  }

  const report = {
    run_at: new Date().toISOString(),
    args: Object.fromEntries(Object.entries(args).filter(([, v]) => v != null && v !== false)),
    targets_total: targets.length,
    targets_run: filtered.length,
    counters,
    error_count: errors.length,
  };
  await fs.writeFile(REPORT_PATH, JSON.stringify(report, null, 2));
  if (errors.length) await fs.writeFile(ERROR_PATH, JSON.stringify(errors, null, 2));

  console.log('\n── Summary ──');
  console.log(`  new:       ${counters.new}`);
  console.log(`  changed:   ${counters.changed}`);
  console.log(`  unchanged: ${counters.unchanged}`);
  console.log(`  maps:      ${counters.maps}`);
  console.log(`  empty:     ${counters.empty}`);
  console.log(`  failed:    ${counters.failed}`);
  console.log(`\nReport → scripts/scrape-report.json`);
  if (errors.length) console.log(`Errors → scripts/scrape-errors.json`);
}

main().catch(err => {
  console.error('Fatal:', err);
  process.exit(1);
});
