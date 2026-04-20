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

// Domains that serve valid pages in a browser but block scripted HEAD/GET
// via CAPTCHA, bot detection, or authentication walls. These are reported
// separately as `skipped` rather than `broken` so they don't trigger CI alarms.
// Only add a domain here after manual browser verification.
const SKIP_HOSTS = new Set([
  'home.army.mil',
  'www.armymwr.com',
  'wiesbaden.armymwr.com',
  'armymwr.com',
  'wiesbaden.tricare.mil',
  'tricare.mil',
  'www.tricare-overseas.com',
  'tricare-overseas.com',
  'www.navyfederal.org',
  'www.sparkasse-wiesbaden.de',
  'www.militaryonesource.mil',
  'militaryonesource.mil',
  'militarypay.defense.gov',
  'www.dodea.edu',
  'dodea.edu',
  'army.dodmwrlibraries.org',
  'www.aphis.usda.gov',
  'aphis.usda.gov',
  'innen.hessen.de',
  'soziales.hessen.de',
  'www.rmv.de',
  'rmv.de',
  'www.wiesbaden.de',
  'wiesbaden.de',
  'wiesbaden-kita.de',
  'www.tieraerzteverband-hessen.de',
  'tieraerzteverband-hessen.de',
  'armyeitaas.sharepoint-mil.us',
  'afsbeurope.army.afpims.mil',
]);

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

  const toCheck = sources.filter(s => {
    try { return !SKIP_HOSTS.has(new URL(s.url).hostname); } catch { return true; }
  });
  const skipped = sources.filter(s => {
    try { return SKIP_HOSTS.has(new URL(s.url).hostname); } catch { return false; }
  }).map(s => ({ ...s, ok: true, status: 'skipped_captcha' }));

  console.log(`Checking ${toCheck.length} source links (${skipped.length} skipped as known-CAPTCHA)...`);

  const results = [];
  for (let i = 0; i < toCheck.length; i += CONCURRENCY) {
    const batch = toCheck.slice(i, i + CONCURRENCY);
    const checked = await Promise.all(batch.map(async s => ({ ...s, ...(await head(s.url)) })));
    results.push(...checked);
    process.stdout.write(`  ${Math.min(i + CONCURRENCY, toCheck.length)}/${toCheck.length}\r`);
  }
  console.log();

  const ok = results.filter(r => r.ok && r.status < 300);
  const redirected = results.filter(r => r.ok && r.status >= 300 && r.status < 400);
  const broken = results.filter(r => !r.ok);

  const report = {
    run_at: new Date().toISOString(),
    total: sources.length,
    ok: ok.length,
    redirected: redirected.length,
    broken: broken.length,
    skipped: skipped.length,
    broken_list: broken,
    redirected_list: redirected,
    skipped_list: skipped,
  };
  await fs.writeFile(REPORT, JSON.stringify(report, null, 2));

  console.log(`  ok:         ${ok.length}`);
  console.log(`  redirected: ${redirected.length}`);
  console.log(`  skipped:    ${skipped.length} (known-CAPTCHA domains)`);
  console.log(`  broken:     ${broken.length}`);
  console.log(`\nReport → scripts/link-report.json`);
  if (broken.length) process.exit(1);
}

main().catch(err => { console.error(err); process.exit(1); });
