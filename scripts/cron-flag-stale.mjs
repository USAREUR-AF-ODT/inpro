#!/usr/bin/env node
/**
 * Identifies the 5 most-stale safety-topic entries (medical/legal/finance/id-cac)
 * and sets stub: true in their frontmatter to hide them from indexes/feeds
 * until a human re-verifies. Writes flag-result.md (PR body) and flag-result.json.
 *
 * Used by .github/workflows/content-audit.yml. Idempotent — re-running on the
 * same content produces the same edits.
 */

import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import yaml from 'js-yaml';

const ROOT = path.resolve(fileURLToPath(import.meta.url), '../..');
const PUB = path.join(ROOT, 'src', 'content', 'published');
const STALE_SAFETY = Number(process.env.STALE_SAFETY ?? 60);
const MAX_FLAG = Number(process.env.MAX_FLAG ?? 5);
const SAFETY_TOPICS = new Set(['medical', 'legal', 'finance', 'id-cac']);

async function* walk(dir) {
  const entries = await fs.readdir(dir, { withFileTypes: true });
  for (const e of entries) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) yield* walk(p);
    else if (e.name.endsWith('.md')) yield p;
  }
}

function parseFm(text) {
  const m = text.match(/^---\n([\s\S]*?)\n---\n?/);
  if (!m) return null;
  try { return { fm: yaml.load(m[1]), raw: m[1], end: m[0].length }; } catch { return null; }
}

function setStubTrue(rawFm) {
  // If a `stub:` line exists, replace it. Otherwise append.
  if (/^stub:\s*\w+$/m.test(rawFm)) return rawFm.replace(/^stub:\s*\w+$/m, 'stub: true');
  return rawFm.replace(/\s*$/, '\n') + 'stub: true\n';
}

async function main() {
  const candidates = [];
  const today = Date.now();

  for await (const fp of walk(PUB)) {
    const text = await fs.readFile(fp, 'utf8');
    const parsed = parseFm(text);
    if (!parsed) continue;
    const { fm } = parsed;
    if (!fm.topic || !SAFETY_TOPICS.has(fm.topic)) continue;
    if (fm.stub === true) continue; // already stubbed; nothing to do
    if (!fm.last_verified) continue;
    const age = Math.floor((today - new Date(fm.last_verified).getTime()) / 86400000);
    if (age <= STALE_SAFETY) continue;
    candidates.push({ fp, fm, age, body: text, parsed });
  }

  candidates.sort((a, b) => b.age - a.age);
  const flagged = candidates.slice(0, MAX_FLAG);

  for (const c of flagged) {
    const newFm = setStubTrue(c.parsed.raw);
    const rest = c.body.slice(c.parsed.end);
    const updated = `---\n${newFm}---\n${rest}`;
    await fs.writeFile(c.fp, updated, 'utf8');
  }

  const summary = flagged.map(c => ({
    file: path.relative(ROOT, c.fp),
    topic: c.fm.topic,
    title: c.fm.title,
    last_verified: c.fm.last_verified,
    age_days: c.age,
  }));

  await fs.writeFile(path.join(ROOT, 'flag-result.json'), JSON.stringify({
    flagged: summary,
    total_stale_safety: candidates.length,
    threshold_days: STALE_SAFETY,
  }, null, 2));

  const md = [
    '## Auto-flagged stale safety entries',
    '',
    `${flagged.length} of ${candidates.length} stale safety-topic entries were set to \`stub: true\` (hides from indexes & feeds until re-verified).`,
    '',
    `Threshold: \`last_verified > ${STALE_SAFETY}d\` on topics in {medical, legal, finance, id-cac}.`,
    '',
  ];
  if (flagged.length) {
    md.push('### Flagged in this PR');
    md.push('');
    for (const f of summary) {
      md.push(`- \`${f.file}\` — **${f.topic}** · "${f.title}" · ${f.age_days}d stale (last verified ${f.last_verified})`);
    }
    md.push('');
  }
  if (candidates.length > flagged.length) {
    md.push(`### Deferred (cap reached)`);
    md.push('');
    md.push(`${candidates.length - flagged.length} additional stale safety entries will be picked up in subsequent runs.`);
    md.push('');
  }
  md.push('### How to resolve');
  md.push('');
  md.push('1. Re-verify each flagged entry against current sources.');
  md.push('2. Update the `last_verified` field to today.');
  md.push('3. Set `stub: false` (or remove the line).');
  md.push('4. Merge.');
  md.push('');
  md.push('_If an entry is irrecoverable (program ended, POC dissolved), keep `stub: true` and document the deprecation in the body._');

  await fs.writeFile(path.join(ROOT, 'flag-result.md'), md.join('\n'));
  console.log(JSON.stringify({ flagged: summary, total: candidates.length }, null, 2));
}

main().catch(err => { console.error(err); process.exit(1); });
