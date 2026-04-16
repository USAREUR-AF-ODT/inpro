#!/usr/bin/env node
/**
 * Content quality lint. Walks src/content/published/**.md and reports:
 *   - missing required frontmatter
 *   - last_verified older than STALE_DAYS (default 60)
 *   - poc_volatile: true without at least one T1 source
 *   - invalid topic/phase enums
 *
 * Exit code 1 if any blocker; warnings only otherwise.
 *
 *   node scripts/audit-content.mjs              # run
 *   node scripts/audit-content.mjs --json       # machine-readable
 *   STALE_DAYS=30 node scripts/audit-content.mjs
 */

import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import yaml from 'js-yaml';

const ROOT = path.resolve(fileURLToPath(import.meta.url), '../..');
const PUB = path.join(ROOT, 'src', 'content', 'published');
const STALE_DAYS = Number(process.env.STALE_DAYS ?? 60);

const TOPICS = ['housing','finance','medical','legal','vehicle','id-cac','family','schools','pets','religious','mwr','unit'];
const PHASES = ['before','arrive','settle','life','sponsors'];

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

async function main() {
  const issues = [];
  let count = 0;

  try { await fs.access(PUB); } catch {
    console.log('No published content yet.');
    return;
  }

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

    if (fm.last_verified) {
      const age = Math.floor((Date.now() - new Date(fm.last_verified).getTime()) / 86400000);
      if (age > STALE_DAYS) {
        issues.push({ file: rel, level: 'warn', msg: `stale: last_verified ${age}d ago (>${STALE_DAYS})` });
      }
    }

    if (fm.poc_volatile) {
      const t1 = (fm.sources ?? []).some(s => s.tier === 'T1');
      if (!t1) issues.push({ file: rel, level: 'warn', msg: 'poc_volatile but no T1 source cited' });
    }

    if (fm.summary && fm.summary.length > 280) {
      issues.push({ file: rel, level: 'warn', msg: `summary ${fm.summary.length} chars (>280)` });
    }
  }

  if (process.argv.includes('--json')) {
    console.log(JSON.stringify({ count, issues, stale_days: STALE_DAYS }, null, 2));
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
