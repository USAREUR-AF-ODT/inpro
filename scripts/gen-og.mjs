#!/usr/bin/env node
import sharp from 'sharp';
import { writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(fileURLToPath(import.meta.url), '../..');
const OUT = path.join(ROOT, 'public', 'og-default.png');

const PAPER = '#F6EFE1';
const PAPER_WARM = '#EAE0CC';
const INK = '#1A1612';
const TERRACOTTA = '#D0532E';
const PLUM = '#7A2A3E';
const MUTED = '#8A7F6E';

const W = 1200;
const H = 630;

const svg = `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">
  <rect width="${W}" height="${H}" fill="${PAPER}"/>
  <rect x="0" y="${H - 8}" width="${W}" height="8" fill="${TERRACOTTA}"/>
  <rect x="0" y="${H - 8}" width="${W * 0.18}" height="8" fill="${PLUM}"/>
  <rect x="${W * 0.18}" y="${H - 8}" width="${W * 0.05}" height="8" fill="${PAPER_WARM}"/>

  <text x="80" y="120" font-family="Inter, system-ui, sans-serif" font-size="20"
        font-weight="500" letter-spacing="3" fill="${MUTED}" text-transform="uppercase">
    UNOFFICIAL · COMMUNITY-MAINTAINED
  </text>

  <text x="80" y="320" font-family="Georgia, 'Times New Roman', serif"
        font-size="240" font-weight="400" fill="${INK}" letter-spacing="-12">
    in<tspan fill="${TERRACOTTA}" font-style="italic">/</tspan>pro
  </text>

  <text x="80" y="410" font-family="Georgia, 'Times New Roman', serif"
        font-size="44" font-weight="400" fill="${PLUM}" font-style="italic">
    The unofficial Wiesbaden PCS guide
  </text>

  <text x="80" y="465" font-family="Inter, system-ui, sans-serif" font-size="22"
        font-weight="400" fill="${INK}">
    Housing · Finance · Medical · Legal · ID/CAC · Schools · Family · German bureaucracy
  </text>

  <text x="80" y="${H - 60}" font-family="Inter, system-ui, sans-serif" font-size="18"
        font-weight="400" fill="${MUTED}">
    Information only — not legal, medical, or financial advice. Not affiliated with USAG Wiesbaden, US Army, or DoD.
  </text>
</svg>`;

const png = await sharp(Buffer.from(svg))
  .png({ compressionLevel: 9, palette: false })
  .toBuffer();

await writeFile(OUT, png);

const { width, height } = await sharp(OUT).metadata();
const sizeKb = (png.length / 1024).toFixed(1);
console.log(`Wrote ${path.relative(ROOT, OUT)} — ${width}x${height} (${sizeKb} KB)`);
