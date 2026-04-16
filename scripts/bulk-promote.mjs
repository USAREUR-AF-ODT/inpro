#!/usr/bin/env node
/**
 * Batch-convert src/content/_raw/**.md → src/content/published/<topic>/<slug>.md
 *
 * Lighter-touch promotion: strips navigation chrome, routes by URL heuristics,
 * generates valid frontmatter, carries over sources. Hand-curated entries are
 * not overwritten.
 *
 *   node scripts/bulk-promote.mjs              # promote all raw
 *   node scripts/bulk-promote.mjs --dry-run    # list what would happen
 *   node scripts/bulk-promote.mjs --force      # overwrite existing published
 */

import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import yaml from 'js-yaml';

const ROOT = path.resolve(fileURLToPath(import.meta.url), '../..');
const RAW = path.join(ROOT, 'src', 'content', '_raw');
const PUB = path.join(ROOT, 'src', 'content', 'published');

const args = { dryRun: false, force: false };
for (const a of process.argv.slice(2)) {
  if (a === '--dry-run') args.dryRun = true;
  else if (a === '--force') args.force = true;
}

async function* walk(dir) {
  const entries = await fs.readdir(dir, { withFileTypes: true });
  for (const e of entries) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) yield* walk(p);
    else if (e.name.endsWith('.md')) yield p;
  }
}

function parseFm(text) {
  const m = text.match(/^---\n([\s\S]*?)\n---\n?([\s\S]*)$/);
  if (!m) return { meta: {}, body: text };
  try { return { meta: yaml.load(m[1]) || {}, body: m[2] }; }
  catch { return { meta: {}, body: text }; }
}

function slugify(s) {
  return String(s).toLowerCase()
    .normalize('NFKD').replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 60);
}

/** Route to a canonical topic based on URL + existing topic + content. */
function routeTopic(meta, body) {
  const url = (meta.source_url || '').toLowerCase();
  const existing = meta.topic;
  const title = (meta.title || '').toLowerCase();
  const b = body.toLowerCase().slice(0, 2000);

  const score = {
    housing: 0, finance: 0, medical: 0, legal: 0, vehicle: 0,
    'id-cac': 0, family: 0, schools: 0, pets: 0, religious: 0, mwr: 0, unit: 0,
  };

  const match = (topic, rx, weight = 1) => { if (rx.test(url + ' ' + title + ' ' + b)) score[topic] += weight; };

  match('housing', /\b(housing|quarters|lodging|lease|lodge|crestview|newman.village|aukamm|hainerberg|tla\b|oha\b)/, 2);
  match('finance', /\b(finance|oha|cola|tla|entitlement|pay\b|allowance|financial)/, 2);
  match('medical', /\b(medical|health|tricare|clinic|emergency|crisis|phone|hospital|arhc)/, 2);
  match('legal', /\b(legal|passport|visa|sofa|divorce|custody|home of record|beitrag|rundfunk|anmelden|anmeldung|fuehrerschein|license|einbuergerung|bamf)/, 2);
  match('vehicle', /\b(vehicle|pov\b|driver|registration|rmv\b|umschreib|bus|taxi|transit|umschreibung|fahrerlaubnis)/, 2);
  match('id-cac', /\b(cac|id card|dodi|dsn|dialing|identification)/, 2);
  match('family', /\b(family|acs\b|spouse|cys\b|kita|kinder|parent|new parent|family advocacy|loan closet|lending closet|efmp|relocation)/, 2);
  match('schools', /\b(school|dodea|wiesbadenhs|wiesbadenes|slo\b|liaison|student|education|teacher|grad(e|uation)|schul)/, 2);
  match('pets', /\b(pet|dog|cat|vet\b|veterinary|import|aphis)/, 2);
  match('religious', /\b(religious|chapel|rso\b|worship|mass\b|service)/, 2);
  match('mwr', /\b(mwr|recreation|fitness|library|lodge|playhouse|outdoor|amelia|automotive skills|sports)/, 2);
  match('unit', /\b(tenant|brigade|battalion|regiment|66th|5th signal|2nd signal|corps|usaincom|inscom)/, 2);

  // Strong prior: keep existing if it's a valid topic
  if (existing && score.hasOwnProperty(existing)) score[existing] += 3;

  let best = 'mixed', bestScore = 0;
  for (const [t, s] of Object.entries(score)) {
    if (s > bestScore) { best = t; bestScore = s; }
  }
  // If nothing matched, default to id-cac (catch-all for general arrival info)
  return bestScore > 0 ? best : 'id-cac';
}

function routePhase(meta, body) {
  const url = (meta.source_url || '').toLowerCase();
  const b = body.toLowerCase().slice(0, 2000);
  if (/before|pre-pcs|sponsorship|packing|prepar|plan/i.test(url + b.slice(0, 500))) return 'before';
  if (/arrive|arrival|newcomer|in-process|inprocessing|check-in|first.days?/i.test(url + b.slice(0, 500))) return 'arrive';
  if (/life|culture|travel|german|rhein|wine|kurhaus|shopping/i.test(url + b.slice(0, 500))) return 'life';
  if (/settle|thirty.day|60.day|90.day|anmeld/i.test(url + b.slice(0, 500))) return 'settle';
  return 'arrive';
}

/** Strip navigation chrome and footer cruft from scraped content. */
function cleanBody(body, kind) {
  // Strip header image blocks
  body = body.replace(/\[!\[Army\.mil\][^\n]*\n+/g, '');
  body = body.replace(/\[Skip to content\][^\n]*\n+/g, '');
  body = body.replace(/^Welcome to Wiesbaden! *\\?\|[^\n]*\n+/m, '');

  // For html2text output: strip everything before the first real H1
  if (kind === 'html-direct') {
    // Navigation menus — everything before "| U.S. Army" or similar pattern
    const menuEnd = body.search(/\n\s*\[Home\]|U\.S\. Army Garrison|\*\*\*\*\*\* /);
    if (menuEnd > 0) body = body.slice(menuEnd);
    // Strip common footer blocks
    body = body.replace(/\n(Need_Help\?_Try_Army|Share this page|Page Last Modified|U\.S\._ARMY_INSTALLATION_MANAGEMENT_COMMAND)[\s\S]*$/m, '');
    body = body.replace(/\n(Employment\nFOIA\nTerms_of_Use|Emergency_numbers\nPolicies_and_regulations)[\s\S]*$/m, '');
    // De-spam all the ASCII rule lines
    body = body.replace(/={40,}/g, '');
    body = body.replace(/\*{4,} [^*\n]+ \*{4,}/g, ''); // **** menu items ****
    body = body.replace(/^\s*\[CLOSE\]\s*$/gm, '');
    body = body.replace(/^\s*SEARCH\s*$/gm, '');
    body = body.replace(/^\s*MENU\s*$/gm, '');
    // Collapse excess blank lines
    body = body.replace(/\n{3,}/g, '\n\n');
  }

  // Firecrawl output: strip obvious nav lists (bulleted lists of menu items at the top)
  // Find first '# ' heading and drop everything before that + nav-looking line
  const lines = body.split('\n');
  let start = 0;
  for (let i = 0; i < Math.min(lines.length, 30); i++) {
    if (/^#\s+\S/.test(lines[i])) { start = i; break; }
  }
  if (start > 5) body = lines.slice(start).join('\n');

  // Trim trailing footer links sections
  body = body.replace(/\n## (Share this page|Related links|Back to top|RSS Feeds)[\s\S]*$/mi, '\n');

  return body.trim();
}

function fmEscape(v) {
  if (typeof v === 'string') return JSON.stringify(v);
  if (Array.isArray(v)) return '[' + v.map(fmEscape).join(', ') + ']';
  if (v && typeof v === 'object') return yaml.dump(v, { flowLevel: 2, lineWidth: 200 }).trim().replace(/\n/g, ' ');
  return JSON.stringify(v);
}

function buildFrontmatter(meta, topic, phase, summary) {
  const obj = {
    title: meta.title || path.basename(meta.source_url || 'entry').replace(/[-_]/g, ' '),
    summary: summary.slice(0, 260),
    topic,
    phase,
    usag: 'wiesbaden',
    profile_tags: { status: ['any'] },
    sources: [{
      tier: meta.tier || 'T2',
      url: meta.source_url,
      label: meta.title || meta.source_host || meta.source_url,
      scraped: meta.last_scraped || meta.first_scraped,
    }],
    last_verified: meta.last_scraped || new Date().toISOString().slice(0, 10),
    order: 500,
  };
  if (/volatile|changes|phone|contact|hours|schedule/i.test(summary)) {
    obj.poc_volatile = true;
  }
  return yaml.dump(obj, { lineWidth: 200 });
}

function extractSummary(body) {
  // First paragraph that isn't a heading or nav
  const paragraphs = body.split(/\n\n+/);
  for (const p of paragraphs) {
    const trimmed = p.trim();
    if (!trimmed) continue;
    if (trimmed.startsWith('#')) continue;
    if (trimmed.startsWith('[') && !trimmed.includes('.')) continue;
    if (trimmed.startsWith('*')) continue;
    if (/^[A-Z_]{3,}/.test(trimmed)) continue;
    // Strip markdown
    const clean = trimmed
      .replace(/\[([^\]]+)\]\([^)]+\)/g, '$1')
      .replace(/[*_#]/g, '')
      .replace(/\s+/g, ' ');
    if (clean.length > 30) return clean.slice(0, 250);
  }
  return 'Imported from scraped source. See body for details.';
}

/** Safe filename for published entry. */
function pubPath(topic, meta) {
  const base = meta.title
    ? slugify(meta.title.replace(/:: USAG WIESBADEN.*$/i, ''))
    : slugify(path.basename(meta.source_url || 'entry'));
  return path.join(PUB, topic, `${base || 'entry'}.md`);
}

async function alreadyPublishedSource(sourceUrl) {
  // Search all existing published entries for matching source_url
  const published = [];
  try {
    for await (const fp of walk(PUB)) {
      const t = await fs.readFile(fp, 'utf8');
      const { meta } = parseFm(t);
      if (meta.sources) {
        for (const s of meta.sources) {
          if (s.url === sourceUrl) return fp;
        }
      }
    }
  } catch {}
  return null;
}

async function main() {
  let promoted = 0, skipped = 0, failed = 0;
  const existingByUrl = new Map();
  // Pre-index existing published entries by source URL
  try {
    for await (const fp of walk(PUB)) {
      const t = await fs.readFile(fp, 'utf8');
      const { meta } = parseFm(t);
      if (meta.sources) {
        for (const s of meta.sources) existingByUrl.set(s.url, fp);
      }
    }
  } catch {}
  console.log(`Pre-indexed ${existingByUrl.size} published source URLs`);

  for await (const fp of walk(RAW)) {
    const rel = path.relative(RAW, fp);
    const text = await fs.readFile(fp, 'utf8');
    const { meta, body } = parseFm(text);
    if (!meta.source_url) { skipped++; continue; }

    // Skip if a published entry already references this source URL
    if (!args.force && existingByUrl.has(meta.source_url)) {
      skipped++;
      continue;
    }

    // Skip obviously-empty scrapes (nav chrome only)
    if (body.length < 500) { skipped++; continue; }

    const topic = routeTopic(meta, body);
    const phase = routePhase(meta, body);
    const cleaned = cleanBody(body, meta.kind);
    if (cleaned.length < 200) { skipped++; continue; }

    const summary = extractSummary(cleaned);
    const frontmatter = buildFrontmatter(meta, topic, phase, summary);
    const dest = pubPath(topic, meta);

    if (args.dryRun) {
      console.log(`  would write → ${path.relative(ROOT, dest)}  [${topic}/${phase}]`);
      promoted++;
      continue;
    }

    // Ensure uniqueness — if collision, append URL hash suffix
    let finalDest = dest;
    let suffix = 0;
    while (!args.force) {
      try {
        await fs.access(finalDest);
        suffix++;
        finalDest = dest.replace(/\.md$/, `-${suffix}.md`);
      } catch { break; }
    }

    try {
      await fs.mkdir(path.dirname(finalDest), { recursive: true });
      const out = `---\n${frontmatter}---\n\n${cleaned}\n`;
      await fs.writeFile(finalDest, out);
      promoted++;
      console.log(`  ✓ ${topic}/${phase}  ${path.basename(finalDest)}`);
    } catch (err) {
      failed++;
      console.error(`  ✗ ${rel}: ${err.message}`);
    }
  }

  console.log(`\n── Summary ──\n  promoted: ${promoted}\n  skipped:  ${skipped}\n  failed:   ${failed}`);
}

main().catch((err) => { console.error(err); process.exit(1); });
