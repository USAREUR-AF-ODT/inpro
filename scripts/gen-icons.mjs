#!/usr/bin/env node
/**
 * Generate PNG icon variants from public/icons/icon.svg.
 *   - apple-touch-icon.png (180×180, served from /)
 *   - icons/icon-192.png   (Android Chrome)
 *   - icons/icon-512.png   (PWA install, "any" purpose)
 *   - icons/icon-maskable-512.png (maskable purpose, padded safe zone)
 */

import sharp from 'sharp';
import { readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(fileURLToPath(import.meta.url), '../..');
const SRC = path.join(ROOT, 'public', 'icons', 'icon.svg');
const PUB = path.join(ROOT, 'public');

const svg = await readFile(SRC);

async function render(out, size) {
  const buf = await sharp(svg, { density: 384 })
    .resize(size, size, { fit: 'cover' })
    .png({ compressionLevel: 9 })
    .toBuffer();
  await writeFile(out, buf);
  console.log(`Wrote ${path.relative(ROOT, out)} — ${size}x${size} (${(buf.length / 1024).toFixed(1)} KB)`);
}

// Maskable: inset the source so OS masks don't crop the glyph. Fill remainder with the icon's plum bg.
async function renderMaskable(out, size) {
  const inner = Math.round(size * 0.8);
  const innerBuf = await sharp(svg, { density: 384 })
    .resize(inner, inner, { fit: 'cover' })
    .png()
    .toBuffer();
  const buf = await sharp({
    create: {
      width: size,
      height: size,
      channels: 4,
      background: { r: 110, g: 30, b: 42, alpha: 1 },  // matches icon.svg plum
    },
  })
    .composite([{ input: innerBuf, gravity: 'center' }])
    .png({ compressionLevel: 9 })
    .toBuffer();
  await writeFile(out, buf);
  console.log(`Wrote ${path.relative(ROOT, out)} — ${size}x${size} maskable (${(buf.length / 1024).toFixed(1)} KB)`);
}

await render(path.join(PUB, 'apple-touch-icon.png'), 180);
await render(path.join(PUB, 'icons', 'icon-192.png'), 192);
await render(path.join(PUB, 'icons', 'icon-512.png'), 512);
await renderMaskable(path.join(PUB, 'icons', 'icon-maskable-512.png'), 512);
