#!/usr/bin/env node
/**
 * scrape-from-maps — consume _map--<host>.md index files and second-pass-fetch
 * every URL not already present as a raw entry.
 *
 * scrape.mjs's doMap() writes a list of discovered URLs to
 *   src/content/_raw/{tier}/{topic}/_map--<host>.md
 * but never feeds them back. This script does that, using the same fetch-first
 * path as ingest.mjs (free for static .mil/.gov hosts; Firecrawl fallback only
 * when direct fetch yields empty/short markdown).
 *
 * Usage:
 *   node scripts/scrape-from-maps.mjs                       # all maps
 *   node scripts/scrape-from-maps.mjs --only home.army.mil  # one host
 *   node scripts/scrape-from-maps.mjs --limit 20            # cap URLs per map
 *   node scripts/scrape-from-maps.mjs --dry-run
 *   node scripts/scrape-from-maps.mjs --no-fallback         # never call Firecrawl
 */

import fs from 'node:fs/promises';
import path from 'node:path';
import crypto from 'node:crypto';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import yaml from 'js-yaml';

const ROOT = path.resolve(fileURLToPath(import.meta.url), '../..');
const RAW_DIR = path.join(ROOT, 'src', 'content', '_raw');
const REPORT_PATH = path.join(ROOT, 'scripts', 'maps-report.json');

const FIRECRAWL_BASE = process.env.FIRECRAWL_BASE_URL ?? 'https://api.firecrawl.dev';
const API_KEY = process.env.FIRECRAWL_API_KEY;
const UA = 'inpro-ingest/0.1 (+https://github.com/USAREUR-AF-ODT/inpro)';

const args = parseArgs(process.argv.slice(2));

function parseArgs(argv) {
  const out = { only: null, limit: null, dryRun: false, noFallback: false, rateMs: 400 };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--dry-run') out.dryRun = true;
    else if (a === '--only') out.only = argv[++i];
    else if (a === '--limit') out.limit = parseInt(argv[++i], 10);
    else if (a === '--no-fallback') out.noFallback = true;
    else if (a === '--rate-ms') out.rateMs = parseInt(argv[++i], 10);
  }
  return out;
}

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

function targetPathFor(tier, topic, url) {
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

async function downloadHtml(url) {
  const ac = new AbortController();
  const t = setTimeout(() => ac.abort(), 30_000);
  try {
    const res = await fetch(url, {
      headers: { 'User-Agent': UA, 'Accept': 'text/html,application/xhtml+xml,*/*', 'Accept-Language': 'en-US,en;q=0.9' },
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
    child.on('close', (code) => code !== 0 ? reject(new Error(`html2text exit ${code}: ${err}`)) : resolve(out));
    child.on('error', (e) => reject(e));
    child.stdin.end(html);
  });
}

function extractTitle(html) {
  const m = html.match(/<title[^>]*>([^<]{1,200})<\/title>/i);
  return m ? m[1].trim().replace(/\s+/g, ' ') : 'Untitled';
}

async function firecrawlScrape(url) {
  if (!API_KEY) throw new Error('FIRECRAWL_API_KEY not set');
  const ac = new AbortController();
  const t = setTimeout(() => ac.abort(), 60_000);
  try {
    const res = await fetch(`${FIRECRAWL_BASE}/v1/scrape`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${API_KEY}` },
      body: JSON.stringify({ url, formats: ['markdown'], onlyMainContent: true, timeout: 30_000, waitFor: 1500, zeroDataRetention: true }),
      signal: ac.signal,
    });
    if (!res.ok) throw new Error(`Firecrawl ${res.status}: ${(await res.text()).slice(0, 200)}`);
    const j = await res.json();
    const data = j?.data ?? j;
    return { markdown: data?.markdown ?? data?.content ?? '', title: data?.metadata?.title ?? data?.title ?? url };
  } finally { clearTimeout(t); }
}

async function* walkMaps(dir) {
  const entries = await fs.readdir(dir, { withFileTypes: true });
  for (const e of entries) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) yield* walkMaps(p);
    else if (/^_map--.+\.md$/.test(e.name)) yield p;
  }
}

function parseMapFile(text) {
  const m = text.match(/^---\n([\s\S]*?)\n---\n([\s\S]*)$/);
  if (!m) return { meta: {}, urls: [] };
  const meta = yaml.load(m[1]) || {};
  const urls = m[2].split('\n')
    .map(l => l.trim())
    .filter(l => l.startsWith('- '))
    .map(l => l.slice(2).trim())
    .filter(Boolean);
  return { meta, urls };
}

async function main() {
  let mapFiles = [];
  try {
    for await (const fp of walkMaps(RAW_DIR)) mapFiles.push(fp);
  } catch {
    console.log('No _raw directory yet.');
    return;
  }

  if (args.only) mapFiles = mapFiles.filter(f => f.includes(args.only));
  console.log(`Found ${mapFiles.length} _map index file(s)`);

  const counters = { mapsRead: 0, urlsTotal: 0, alreadyHave: 0, fetched: 0, empty: 0, failed: 0, firecrawlCalls: 0 };
  const errors = [];

  for (const mapFp of mapFiles) {
    counters.mapsRead++;
    const text = await fs.readFile(mapFp, 'utf8');
    const { meta, urls } = parseMapFile(text);
    if (!meta.tier || !meta.topic) {
      console.warn(`  skip ${path.relative(ROOT, mapFp)} — missing tier/topic in meta`);
      continue;
    }
    const cap = args.limit ?? urls.length;
    const todo = urls.slice(0, cap);
    counters.urlsTotal += todo.length;
    console.log(`\n── ${path.relative(ROOT, mapFp)} (${urls.length} URLs, processing ${todo.length}) ──`);

    for (let i = 0; i < todo.length; i++) {
      const url = todo[i];
      const dest = targetPathFor(meta.tier, meta.topic, url);
      try { await fs.access(dest); counters.alreadyHave++; continue; } catch {}

      if (args.dryRun) {
        console.log(`  would fetch ${url}`);
        continue;
      }

      try {
        let md = '', title = '', source = 'html-direct';
        try {
          const html = await downloadHtml(url);
          md = await htmlToMarkdown(html);
          title = extractTitle(html);
        } catch { md = ''; }

        if ((!md || md.trim().length < 200) && !args.noFallback) {
          counters.firecrawlCalls++;
          const fc = await firecrawlScrape(url);
          md = fc.markdown; title = fc.title; source = 'firecrawl-fallback';
        }

        if (!md.trim()) { counters.empty++; continue; }

        const meta2 = {
          source_url: url,
          source_host: hostFromUrl(url),
          tier: meta.tier,
          topic: meta.topic,
          kind: source,
          title: title || url,
          first_scraped: now(),
          last_scraped: now(),
          content_hash: sha256(md),
          byte_count: md.length,
          discovered_via: path.basename(mapFp),
        };
        await fs.mkdir(path.dirname(dest), { recursive: true });
        await fs.writeFile(dest, toFrontmatter(meta2) + md.trim() + '\n', 'utf8');
        counters.fetched++;
        process.stdout.write(`  [${i + 1}/${todo.length}] ✓ ${url}\n`);
      } catch (err) {
        counters.failed++;
        errors.push({ url, error: String(err?.message ?? err), map: path.relative(ROOT, mapFp) });
        process.stdout.write(`  [${i + 1}/${todo.length}] ✗ ${url} — ${err.message}\n`);
      }

      if (args.rateMs && !args.dryRun) await sleep(args.rateMs);
    }
  }

  const report = { run_at: new Date().toISOString(), args, counters, error_count: errors.length };
  await fs.writeFile(REPORT_PATH, JSON.stringify({ ...report, errors }, null, 2));

  console.log('\n── Summary ──');
  for (const [k, v] of Object.entries(counters)) console.log(`  ${k.padEnd(16)} ${v}`);
  console.log(`\nReport → scripts/maps-report.json`);
}

main().catch(err => { console.error('Fatal:', err); process.exit(1); });
