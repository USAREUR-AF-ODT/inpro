#!/usr/bin/env node
/**
 * HEAD-check every sources[].url in src/content/published/**.md.
 * Emits scripts/link-report.json with {ok, broken, redirected}.
 *
 *   node scripts/verify-links.mjs
 */

import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import yaml from 'js-yaml';

const ROOT = path.resolve(fileURLToPath(import.meta.url), '../..');
const PUB = path.join(ROOT, 'src', 'content', 'published');
const REPORT = path.join(ROOT, 'scripts', 'link-report.json');
const CONCURRENCY = 6;

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

async function head(url) {
  try {
    const res = await fetch(url, { method: 'HEAD', redirect: 'manual' });
    if (res.status >= 200 && res.status < 300) return { ok: true, status: res.status };
    if (res.status >= 300 && res.status < 400) {
      return { ok: true, status: res.status, redirect: res.headers.get('location') };
    }
    // Retry as GET — some servers block HEAD
    const getRes = await fetch(url, { method: 'GET' });
    return { ok: getRes.ok, status: getRes.status };
  } catch (err) {
    return { ok: false, status: 0, error: String(err?.message ?? err) };
  }
}

async function main() {
  const sources = [];
  try { await fs.access(PUB); } catch { console.log('No published content.'); return; }

  for await (const fp of walk(PUB)) {
    const rel = path.relative(ROOT, fp);
    const text = await fs.readFile(fp, 'utf8');
    const fm = parseFm(text);
    if (!fm?.sources) continue;
    for (const s of fm.sources) sources.push({ file: rel, url: s.url, label: s.label, tier: s.tier });
  }

  console.log(`Checking ${sources.length} source links...`);

  const results = [];
  for (let i = 0; i < sources.length; i += CONCURRENCY) {
    const batch = sources.slice(i, i + CONCURRENCY);
    const checked = await Promise.all(batch.map(async s => ({ ...s, ...(await head(s.url)) })));
    results.push(...checked);
    process.stdout.write(`  ${Math.min(i + CONCURRENCY, sources.length)}/${sources.length}\r`);
  }
  console.log();

  const ok = results.filter(r => r.ok && r.status < 300);
  const redirected = results.filter(r => r.ok && r.status >= 300 && r.status < 400);
  const broken = results.filter(r => !r.ok);

  const report = {
    run_at: new Date().toISOString(),
    total: results.length,
    ok: ok.length,
    redirected: redirected.length,
    broken: broken.length,
    broken_list: broken,
    redirected_list: redirected,
  };
  await fs.writeFile(REPORT, JSON.stringify(report, null, 2));

  console.log(`  ok:         ${ok.length}`);
  console.log(`  redirected: ${redirected.length}`);
  console.log(`  broken:     ${broken.length}`);
  console.log(`\nReport → scripts/link-report.json`);
  if (broken.length) process.exit(1);
}

main().catch(err => { console.error(err); process.exit(1); });
