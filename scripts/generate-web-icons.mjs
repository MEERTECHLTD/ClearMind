#!/usr/bin/env node
/**
 * Regenerate the web/PWA icons in public/ from the app's real branding (the
 * same artwork the mobile app ships). Run: node scripts/generate-web-icons.mjs
 *
 *   - "any" icons + favicons + apple-touch-icon: the full-bleed app icon
 *   - maskable icons: the Android adaptive foreground (already inside the
 *     safe zone) on the app's midnight background, so OS masks never clip it
 */
import sharp from 'sharp';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const brand = path.join(root, 'apps/mobile/assets/branding');
const out = (f) => path.join(root, 'public', f);
const MIDNIGHT = '#05050A';

const icon = path.join(brand, 'icon.png');
const foreground = path.join(brand, 'adaptive-foreground.png');

const plain = [
  ['icon-16.png', 16], ['icon-32.png', 32], ['favicon.png', 32], ['icon-144.png', 144],
  ['icon-180.png', 180], ['apple-touch-icon.png', 180], ['icon-192.png', 192], ['icon-512.png', 512],
];
for (const [file, size] of plain) {
  await sharp(icon).resize(size, size, { kernel: 'lanczos3' }).png({ compressionLevel: 9 }).toFile(out(file));
}

for (const size of [192, 512]) {
  const fg = await sharp(foreground).resize(size, size).png().toBuffer();
  await sharp({ create: { width: size, height: size, channels: 4, background: MIDNIGHT } })
    .composite([{ input: fg }])
    .flatten({ background: MIDNIGHT })
    .png({ compressionLevel: 9 })
    .toFile(out(`icon-maskable-${size}.png`));
}
// In-app logo (shown at <= 80 CSS px): a 256px copy of the 1024px marketing
// logo, which stays as-is for og:image.
await sharp(out('clearmindlogo.png')).resize(256, 256, { kernel: 'lanczos3' }).png({ compressionLevel: 9 }).toFile(out('clearmindlogo-256.png'));

console.log('web icons written to public/');
