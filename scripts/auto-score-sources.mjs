#!/usr/bin/env node
/**
 * auto-score-sources — walk published entries, fill in source.score from rules.
 *
 * Reads src/content/published/**.md, parses frontmatter, scores each source[]
 * entry using scripts/lib/score.mjs, and rewrites the file with the scorecard
 * embedded in each source. Idempotent — re-running produces no diff if scores
 * are already present and inputs unchanged. Use --check to fail (non-zero exit)
 * when entries lack scores, suitable for CI gating.
 *
 * Usage:
 *   node scripts/auto-score-sources.mjs                    # write scores
 *   node scripts/auto-score-sources.mjs --check            # exit 1 if any entry missing scores
 *   node scripts/auto-score-sources.mjs --dry-run          # preview, no writes
 *   node scripts/auto-score-sources.mjs --force            # overwrite existing scores
 *   node scripts/auto-score-sources.mjs --topic medical    # filter
 */

import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import yaml from 'js-yaml';
import { scoreSource } from './lib/score.mjs';

const ROOT = path.resolve(fileURLToPath(import.meta.url), '../..');
const PUB = path.join(ROOT, 'src', 'content', 'published');

const args = parseArgs(process.argv.slice(2));
function parseArgs(argv) {
  const out = { check: false, dryRun: false, force: false, topic: null };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--check') out.check = true;
    else if (a === '--dry-run') out.dryRun = true;
    else if (a === '--force') out.force = true;
    else if (a === '--topic') out.topic = argv[++i];
  }
  return out;
}

async function* walk(dir) {
  const entries = await fs.readdir(dir, { withFileTypes: true });
  for (const e of entries) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) yield* walk(p);
    else if (e.name.endsWith('.md')) yield p;
  }
}

function parseFile(text) {
  const m = text.match(/^---\n([\s\S]*?)\n---\n?([\s\S]*)$/);
  if (!m) return null;
  try {
    return { fm: yaml.load(m[1]) ?? {}, frontmatter: m[1], body: m[2] };
  } catch { return null; }
}

function dumpFm(fm) {
  // Use yaml.dump with lineWidth that doesn't fold long URLs.
  return yaml.dump(fm, { lineWidth: 200, noRefs: true });
}

async function main() {
  const today = new Date();
  let scanned = 0, updated = 0, alreadyScored = 0, missingAfter = 0;
  const missingFiles = [];

  for await (const fp of walk(PUB)) {
    scanned++;
    const text = await fs.readFile(fp, 'utf8');
    const parsed = parseFile(text);
    if (!parsed) continue;
    const { fm, body } = parsed;
    if (args.topic && fm.topic !== args.topic) continue;
    if (!Array.isArray(fm.sources) || fm.sources.length === 0) continue;

    if (args.check) {
      // --check is read-only: report entries that lack scores; don't mutate.
      const missing = fm.sources.some(s => !s.score);
      if (missing) {
        missingAfter++;
        missingFiles.push(path.relative(ROOT, fp));
      }
      continue;
    }

    let touched = false;
    for (const s of fm.sources) {
      if (s.score && !args.force) continue;
      s.score = scoreSource(s, {
        lastVerified: fm.last_verified,
        allSources: fm.sources,
        today,
      });
      touched = true;
    }

    if (!touched) { alreadyScored++; continue; }
    if (args.dryRun) { updated++; continue; }

    const next = `---\n${dumpFm(fm)}---\n${body}`;
    await fs.writeFile(fp, next, 'utf8');
    updated++;
  }

  if (args.check) {
    console.log(`Scanned ${scanned} entries; ${missingAfter} have unscored sources.`);
    for (const f of missingFiles.slice(0, 20)) console.log(`  - ${f}`);
    if (missingAfter > 20) console.log(`  …${missingAfter - 20} more`);
    process.exit(missingAfter ? 1 : 0);
  }

  console.log(`Scanned ${scanned} entries; updated ${updated}; already-scored ${alreadyScored}.`);
}

main().catch(err => { console.error(err); process.exit(1); });
