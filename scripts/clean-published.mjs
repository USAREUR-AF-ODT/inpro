#!/usr/bin/env node
/**
 * Post-promotion cleanup: fix PDF-extracted text artifacts in published entries.
 * - Strip leading whitespace per line (PDF-to-text columns become <pre> in markdown)
 * - Remove weird leading unicode markers
 * - Collapse excessive blank lines
 * - Drop box-drawing characters from html2text output
 */

import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import yaml from 'js-yaml';

const ROOT = path.resolve(fileURLToPath(import.meta.url), '../..');
const PUB = path.join(ROOT, 'src', 'content', 'published');

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
  if (!m) return { meta: null, body: text, raw: text };
  try { return { meta: yaml.load(m[1]), body: m[2], frontmatter: m[1] }; }
  catch { return { meta: null, body: text, raw: text }; }
}

function cleanMarkdown(body) {
  let out = body;

  // Strip leading whitespace per line — PDF columns shouldn't render as code
  // but preserve list marker indentation (up to 3 spaces before -, *, 1., etc.)
  out = out.split('\n').map(line => {
    if (/^\s{0,3}[-*+•]\s/.test(line)) return line.replace(/^\s+/, '');
    if (/^\s{0,3}\d+[.)]\s/.test(line)) return line.replace(/^\s+/, '');
    if (/^\s{0,3}#/.test(line)) return line.replace(/^\s+/, '');
    if (/^\s{4,}\S/.test(line) && !/^    [-*+]/.test(line)) {
      // PDF fixed-column padding — collapse to no indent
      return line.replace(/^\s+/, '');
    }
    return line;
  }).join('\n');

  // Convert common PDF bullet markers (▪, •, o, ·) to markdown bullets
  out = out.replace(/^([▪•·])\s+/gm, '- ');
  out = out.replace(/^o\s+/gm, '- ');
  out = out.replace(/^\u0000/gm, '- '); // null-ish PDF artifact

  // Remove spurious box-drawing characters from html2text
  out = out.replace(/[┌┐└┘─│├┤┬┴┼]/g, '');

  // Collapse 3+ blank lines
  out = out.replace(/\n{3,}/g, '\n\n');

  // Remove trailing whitespace per line
  out = out.split('\n').map(l => l.replace(/\s+$/, '')).join('\n');

  // Strip isolated "\" at line end (latex-ish line continuations from PDFs)
  out = out.replace(/\\\n/g, '\n');

  return out.trim();
}

async function main() {
  let touched = 0, unchanged = 0;
  for await (const fp of walk(PUB)) {
    const text = await fs.readFile(fp, 'utf8');
    const { meta, body, frontmatter } = parseFm(text);
    if (!meta || !body) continue;
    const cleaned = cleanMarkdown(body);
    if (cleaned === body.trim()) { unchanged++; continue; }
    await fs.writeFile(fp, `---\n${frontmatter}\n---\n\n${cleaned}\n`);
    touched++;
  }
  console.log(`Cleaned ${touched} entries; ${unchanged} unchanged.`);
}

main().catch(err => { console.error(err); process.exit(1); });
