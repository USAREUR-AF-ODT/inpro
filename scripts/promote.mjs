#!/usr/bin/env node
/**
 * Interactive: turn a raw scrape into a published entry.
 *
 *   node scripts/promote.mjs src/content/raw/t1/housing/home-army-mil--wiesbaden-housing.md
 *
 * Prompts for title, summary, phase, profile tags, POC info.
 * Writes to src/content/published/<topic>/<slug>.md with sources[] prefilled
 * from the raw frontmatter. Does not delete the raw file.
 */

import fs from 'node:fs/promises';
import path from 'node:path';
import readline from 'node:readline/promises';
import { stdin as input, stdout as output } from 'node:process';
import { fileURLToPath } from 'node:url';
import yaml from 'js-yaml';

const ROOT = path.resolve(fileURLToPath(import.meta.url), '../..');
const PUB = path.join(ROOT, 'src', 'content', 'published');

function parseFrontmatter(text) {
  const m = text.match(/^---\n([\s\S]*?)\n---\n?([\s\S]*)$/);
  if (!m) return { meta: {}, body: text };
  return { meta: yaml.load(m[1]) || {}, body: m[2] };
}

function slugify(s) {
  return String(s).toLowerCase()
    .normalize('NFKD').replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 60);
}

async function main() {
  const src = process.argv[2];
  if (!src) {
    console.error('usage: node scripts/promote.mjs <raw-file.md>');
    process.exit(1);
  }
  const text = await fs.readFile(src, 'utf8');
  const { meta, body } = parseFrontmatter(text);

  const rl = readline.createInterface({ input, output });
  const ask = async (q, def) => {
    const ans = (await rl.question(`${q}${def ? ` [${def}]` : ''}: `)).trim();
    return ans || def || '';
  };

  console.log('\n── Promote raw entry to published ──');
  console.log(`Source URL: ${meta.source_url}`);
  console.log(`Tier:       ${meta.tier}`);
  console.log(`Topic:      ${meta.topic}`);
  console.log(`Title:      ${meta.title}\n`);

  const title = await ask('title', meta.title);
  const summary = await ask('summary (<=280 chars)');
  const topic = await ask('topic', meta.topic);
  const phase = await ask('phase (before/arrive/settle/life/sponsors)', 'arrive');
  const status = await ask('profile_tags.status (comma; soldier,daciv,contractor,family,any)', 'any');
  const rank = await ask('profile_tags.rank (comma; E1-E4,E5-E6,E7-E9,WO,CO-FG,GS,any)', 'any');
  const accompanied = await ask('profile_tags.accompanied (yes/no/any)', 'any');
  const has_kids = await ask('profile_tags.has_kids (yes/no/any)', 'any');
  const has_pov = await ask('profile_tags.has_pov (yes/no/any)', 'any');
  const has_pets = await ask('profile_tags.has_pets (yes/no/any)', 'any');
  const poc_volatile = (await ask('POC info changes often? (y/n)', 'n')).toLowerCase().startsWith('y');
  const slugAns = await ask('slug', slugify(title));

  rl.close();

  const out = {
    title,
    summary,
    topic,
    phase,
    usag: 'wiesbaden',
    profile_tags: {
      status: status.split(',').map(s => s.trim()).filter(Boolean),
      rank: rank.split(',').map(s => s.trim()).filter(Boolean),
      accompanied,
      has_kids,
      has_pov,
      has_pets,
    },
    sources: [{
      tier: meta.tier,
      url: meta.source_url,
      label: meta.title || meta.source_url,
      scraped: meta.last_scraped,
    }],
    last_verified: new Date().toISOString().slice(0, 10),
    poc_volatile,
    order: 100,
  };

  const dest = path.join(PUB, topic, `${slugAns}.md`);
  await fs.mkdir(path.dirname(dest), { recursive: true });

  const yamlOut = yaml.dump(out, { lineWidth: 120 });
  const scaffold = `---\n${yamlOut}---\n\n## What\n\n${body.slice(0, 400)}...\n\n## Where\n\n## When\n\n## Contact\n\n## Gotchas\n\n## Sources\n\nSee the Sources panel below for references.\n`;

  await fs.writeFile(dest, scaffold);
  console.log(`\nWrote ${dest}`);
  console.log('Edit the sections to curate published content. Raw file kept for reference.');
}

main().catch(err => { console.error(err); process.exit(1); });
