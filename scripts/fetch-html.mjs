#!/usr/bin/env node
/**
 * Download HTML pages directly + convert to markdown locally (html2text).
 * Fallback for pages Firecrawl times out on (home.army.mil, myarmybenefits.us.army.mil).
 *
 * Same frontmatter schema as scrape.mjs so promote.mjs is compatible.
 *
 * Reads targets.yml (kind: scrape, non-PDF URLs) and processes those not already
 * present in _raw/. Also accepts an error-list input from scripts/scrape-errors.json.
 *
 *   node scripts/fetch-html.mjs                    # all kind:scrape non-PDF targets
 *   node scripts/fetch-html.mjs --from-errors      # only targets that failed in scrape-errors.json
 *   node scripts/fetch-html.mjs --only myarmybenefits
 */

import fs from 'node:fs/promises';
import path from 'node:path';
import crypto from 'node:crypto';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import yaml from 'js-yaml';

const ROOT = path.resolve(fileURLToPath(import.meta.url), '../..');
const RAW_DIR = path.join(ROOT, 'src', 'content', '_raw');
const TARGETS_PATH = path.join(ROOT, 'scripts', 'targets.yml');
const ERRORS_PATH = path.join(ROOT, 'scripts', 'scrape-errors.json');

const args = parseArgs(process.argv.slice(2));

function parseArgs(argv) {
  const out = { only: null, dryRun: false, fromErrors: false, force: false };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--only') out.only = argv[++i];
    else if (a === '--from-errors') out.fromErrors = true;
    else if (a === '--force') out.force = true;
    else if (a === '--dry-run') out.dryRun = true;
  }
  return out;
}

const now = () => new Date().toISOString().slice(0, 10);
const sha256 = (s) => crypto.createHash('sha256').update(s).digest('hex');

function slugify(s) {
  return String(s).toLowerCase()
    .normalize('NFKD').replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 80);
}

function hostFromUrl(u) { try { return new URL(u).host.replace(/^www\./, ''); } catch { return 'unknown'; } }

function targetPath(tier, topic, url) {
  const host = hostFromUrl(url);
  const pathPart = slugify(new URL(url).pathname) || 'index';
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
      headers: {
        'User-Agent': 'Mozilla/5.0 (X11; Linux x86_64) inpro/0.1',
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
    // html2text: converts HTML → plaintext, preserving structure reasonably well
    const child = spawn('html2text', ['-utf8', '-width', '100']);
    let out = '', err = '';
    child.stdout.on('data', (d) => { out += d.toString('utf8'); });
    child.stderr.on('data', (d) => { err += d.toString('utf8'); });
    child.on('close', (code) => {
      if (code !== 0) reject(new Error(`html2text exit ${code}: ${err}`));
      else resolve(out);
    });
    child.stdin.end(html);
  });
}

function extractTitle(html) {
  const m = html.match(/<title[^>]*>([^<]{1,200})<\/title>/i);
  return m ? m[1].trim().replace(/\s+/g, ' ') : 'Untitled';
}

async function main() {
  const raw = await fs.readFile(TARGETS_PATH, 'utf8');
  let targets = yaml.load(raw);

  // Filter to kind:scrape + non-PDF
  targets = targets.filter(t => t.kind === 'scrape' && t.url && !/\.pdf$/i.test(new URL(t.url).pathname));

  if (args.fromErrors) {
    try {
      const errs = JSON.parse(await fs.readFile(ERRORS_PATH, 'utf8'));
      const failedUrls = new Set(errs.map(e => e.target?.url).filter(Boolean));
      targets = targets.filter(t => failedUrls.has(t.url));
      console.log(`Filtered to ${targets.length} previously-failed targets`);
    } catch (err) {
      console.error(`Could not read scrape-errors.json: ${err.message}`);
      process.exit(1);
    }
  }
  if (args.only) {
    targets = targets.filter(t => t.url.toLowerCase().includes(args.only.toLowerCase()));
  }

  console.log(`Processing ${targets.length} HTML targets`);
  const counters = { new: 0, unchanged: 0, failed: 0, empty: 0 };

  for (let i = 0; i < targets.length; i++) {
    const t = targets[i];
    const dest = targetPath(t.tier, t.topic, t.url);
    console.log(`\n[${i + 1}/${targets.length}] ${t.url}`);

    if (!args.force) {
      try { await fs.access(dest); console.log('  (already exists — skip; use --force to overwrite)'); counters.unchanged++; continue; }
      catch {}
    }
    if (args.dryRun) { console.log('  would fetch'); continue; }

    const t0 = Date.now();
    let html;
    try { html = await downloadHtml(t.url); }
    catch (err) { console.error(`  download failed: ${err.message}`); counters.failed++; continue; }
    console.log(`  downloaded ${(html.length / 1024).toFixed(1)} KB in ${Date.now() - t0}ms`);

    let md;
    try { md = await htmlToMarkdown(html); }
    catch (err) { console.error(`  html2text failed: ${err.message}`); counters.failed++; continue; }

    if (!md.trim() || md.length < 200) {
      console.warn(`  content too short (${md.length} chars) — likely SPA or blocked`);
      counters.empty++;
      continue;
    }

    const title = extractTitle(html);
    const meta = {
      source_url: t.url,
      source_host: hostFromUrl(t.url),
      tier: t.tier,
      topic: t.topic,
      kind: 'html-direct',
      title,
      first_scraped: now(),
      last_scraped: now(),
      content_hash: sha256(md),
      byte_count: md.length,
      html_size: html.length,
    };
    await fs.mkdir(path.dirname(dest), { recursive: true });
    await fs.writeFile(dest, toFrontmatter(meta) + md.trim() + '\n');
    console.log(`  wrote ${md.length} chars → ${path.relative(ROOT, dest)}`);
    counters.new++;
  }

  console.log(`\n── Summary ──\n  new: ${counters.new}\n  unchanged: ${counters.unchanged}\n  empty: ${counters.empty}\n  failed: ${counters.failed}`);
}

main().catch(err => { console.error(err); process.exit(1); });
