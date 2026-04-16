#!/usr/bin/env node
/**
 * Download PDFs directly + extract text locally, bypass Firecrawl.
 * For PDFs that Firecrawl times out on (common for larger PDFs on slow sites).
 *
 * Reads the same targets.yml and picks entries that look like PDFs.
 * Writes to src/content/_raw/{tier}/{topic}/{slug}.md with the same frontmatter
 * schema as scrape.mjs, so promote.mjs works identically.
 *
 * Requires: pdftotext (from poppler-utils)
 *
 *   node scripts/fetch-pdfs.mjs
 *   node scripts/fetch-pdfs.mjs --only welcome
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
const TMP_DIR = '/tmp/inpro-pdfs';

const args = parseArgs(process.argv.slice(2));

function parseArgs(argv) {
  const out = { only: null, dryRun: false };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--only') out.only = argv[++i];
    else if (a === '--dry-run') out.dryRun = true;
  }
  return out;
}

const now = () => new Date().toISOString().slice(0, 10);

function sha256(s) { return crypto.createHash('sha256').update(s).digest('hex'); }

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

async function downloadPdf(url, dest) {
  const res = await fetch(url, {
    headers: {
      'User-Agent': 'Mozilla/5.0 (inpro-fetch-pdfs/0.1)',
      'Accept': 'application/pdf,*/*',
    },
  });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const buf = Buffer.from(await res.arrayBuffer());
  await fs.writeFile(dest, buf);
  return buf.length;
}

function pdfToText(pdfPath) {
  return new Promise((resolve, reject) => {
    // -layout preserves column structure; -nopgbrk removes form feeds
    const child = spawn('pdftotext', ['-layout', '-nopgbrk', pdfPath, '-']);
    let out = '';
    let err = '';
    child.stdout.on('data', (d) => { out += d.toString('utf8'); });
    child.stderr.on('data', (d) => { err += d.toString('utf8'); });
    child.on('close', (code) => {
      if (code !== 0) reject(new Error(`pdftotext exit ${code}: ${err}`));
      else resolve(out);
    });
  });
}

async function main() {
  await fs.mkdir(TMP_DIR, { recursive: true });
  const raw = await fs.readFile(TARGETS_PATH, 'utf8');
  const targets = yaml.load(raw);
  const pdfs = targets.filter(t =>
    t.kind === 'scrape' &&
    t.url &&
    /\.pdf$/i.test(new URL(t.url).pathname) &&
    (!args.only || t.url.toLowerCase().includes(args.only.toLowerCase()))
  );
  console.log(`Found ${pdfs.length} PDF targets${args.only ? ` matching "${args.only}"` : ''}`);

  const counters = { new: 0, unchanged: 0, failed: 0 };

  for (let i = 0; i < pdfs.length; i++) {
    const t = pdfs[i];
    const dest = targetPath(t.tier, t.topic, t.url);
    console.log(`\n[${i + 1}/${pdfs.length}] ${t.url}`);

    try { await fs.access(dest); console.log('  (already exists — skipping)'); counters.unchanged++; continue; }
    catch {}

    if (args.dryRun) { console.log('  would fetch'); continue; }

    const name = path.basename(new URL(t.url).pathname);
    const localPdf = path.join(TMP_DIR, name);

    const t0 = Date.now();
    let size;
    try { size = await downloadPdf(t.url, localPdf); }
    catch (err) { console.error(`  download failed: ${err.message}`); counters.failed++; continue; }
    console.log(`  downloaded ${(size / 1024).toFixed(1)} KB in ${Date.now() - t0}ms`);

    let text;
    try { text = await pdfToText(localPdf); }
    catch (err) { console.error(`  pdftotext failed: ${err.message}`); counters.failed++; continue; }

    if (!text.trim()) { console.warn('  empty text (image-only PDF?)'); counters.failed++; continue; }

    const title = t.notes ?? path.basename(new URL(t.url).pathname);
    const meta = {
      source_url: t.url,
      source_host: hostFromUrl(t.url),
      tier: t.tier,
      topic: t.topic,
      kind: 'pdf-direct',
      title,
      first_scraped: now(),
      last_scraped: now(),
      content_hash: sha256(text),
      byte_count: text.length,
      pdf_size_bytes: size,
    };
    await fs.mkdir(path.dirname(dest), { recursive: true });
    await fs.writeFile(dest, toFrontmatter(meta) + text.trim() + '\n');
    console.log(`  wrote ${text.length} chars → ${path.relative(ROOT, dest)}`);
    counters.new++;
  }

  console.log(`\n── Summary ──\n  new: ${counters.new}\n  unchanged: ${counters.unchanged}\n  failed: ${counters.failed}`);
}

main().catch((err) => { console.error(err); process.exit(1); });
