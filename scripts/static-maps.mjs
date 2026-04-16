#!/usr/bin/env node
/**
 * Pre-render OSM static-map PNGs for every POC.maps_query in published entries.
 * Used as the offline fallback in MapEmbed.astro.
 *
 * Writes public/maps/<sha1-of-query>.png.
 * Uses staticmap.openstreetmap.de — no API key, rate-limited politely.
 *
 *   node scripts/static-maps.mjs
 */

import fs from 'node:fs/promises';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';
import yaml from 'js-yaml';

const ROOT = path.resolve(fileURLToPath(import.meta.url), '../..');
const PUB = path.join(ROOT, 'src', 'content', 'published');
const OUT = path.join(ROOT, 'public', 'maps');

const RATE_MS = 1500; // be polite

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

function queryHash(q) {
  return crypto.createHash('sha1').update(q).digest('hex').slice(0, 12);
}

async function geocode(q) {
  const url = `https://nominatim.openstreetmap.org/search?q=${encodeURIComponent(q)}&format=json&limit=1`;
  const res = await fetch(url, { headers: { 'User-Agent': 'inpro-static-maps/0.1 (build script)' } });
  if (!res.ok) throw new Error(`nominatim ${res.status}`);
  const data = await res.json();
  if (!data.length) throw new Error(`no geocode hit for: ${q}`);
  return { lat: Number(data[0].lat), lon: Number(data[0].lon) };
}

async function renderStaticMap(lat, lon, outPath) {
  // staticmap.openstreetmap.de renders from OSM tiles.
  const url = `https://staticmap.openstreetmap.de/staticmap.php?center=${lat},${lon}&zoom=15&size=640x360&markers=${lat},${lon},red-pushpin`;
  const res = await fetch(url);
  if (!res.ok) throw new Error(`staticmap ${res.status}`);
  const buf = Buffer.from(await res.arrayBuffer());
  await fs.writeFile(outPath, buf);
}

const sleep = (ms) => new Promise(r => setTimeout(r, ms));

async function main() {
  await fs.mkdir(OUT, { recursive: true });
  const queries = new Set();

  try { await fs.access(PUB); } catch { console.log('No published content.'); return; }

  for await (const fp of walk(PUB)) {
    const text = await fs.readFile(fp, 'utf8');
    const fm = parseFm(text);
    for (const p of fm?.poc ?? []) {
      if (p.maps_query) queries.add(p.maps_query);
    }
  }
  console.log(`Rendering ${queries.size} unique POC maps...`);

  let done = 0;
  for (const q of queries) {
    done++;
    const h = queryHash(q);
    const png = path.join(OUT, `${h}.png`);
    try { await fs.access(png); console.log(`  [${done}] cached: ${q}`); continue; } catch {}

    try {
      const { lat, lon } = await geocode(q);
      await sleep(RATE_MS);
      await renderStaticMap(lat, lon, png);
      console.log(`  [${done}] wrote ${path.relative(ROOT, png)}  ${q}`);
    } catch (err) {
      console.warn(`  [${done}] failed: ${q} — ${err.message}`);
    }
    await sleep(RATE_MS);
  }
}

main().catch(err => { console.error(err); process.exit(1); });
