// Alternate app icons (Settings → Appearance → App icon), generated from the
// real ClearMind symbol (same crop as generate-icons.mjs). iOS icons are
// flattened 1024px PNGs (no alpha); Android uses an adaptive foreground over a
// background colour. Run from the repo root: node apps/mobile/scripts/generate-alt-icons.mjs
import sharp from 'sharp';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import { mkdirSync } from 'node:fs';

const __dirname = dirname(fileURLToPath(import.meta.url));
const SRC = resolve(__dirname, '../../../public/clearmindlogo.png');
const OUT = resolve(__dirname, '../assets/icons');
mkdirSync(OUT, { recursive: true });
const SYMBOL = { left: 291, top: 139, width: 495, height: 532 };

export const VARIANTS = [
  { name: 'Light', bg: '#FFFFFF', mono: false },
  { name: 'Ocean', bg: '#1E40AF', mono: false },
  { name: 'Sunset', bg: '#EA580C', mono: true },
  { name: 'Forest', bg: '#065F46', mono: false },
  { name: 'Mono', bg: '#111111', mono: true },
];

const hex = (h) => ({ r: parseInt(h.slice(1, 3), 16), g: parseInt(h.slice(3, 5), 16), b: parseInt(h.slice(5, 7), 16), alpha: 1 });

async function symbol(size, mono) {
  let s = sharp(SRC).extract(SYMBOL).resize(size, size, { fit: 'contain', background: { r: 0, g: 0, b: 0, alpha: 0 } });
  if (mono) {
    // White silhouette from the alpha channel.
    const { data, info } = await s.ensureAlpha().raw().toBuffer({ resolveWithObject: true });
    for (let i = 0; i < data.length; i += 4) { data[i] = 255; data[i + 1] = 255; data[i + 2] = 255; }
    return sharp(data, { raw: info }).png().toBuffer();
  }
  return s.png().toBuffer();
}

for (const v of VARIANTS) {
  const slug = v.name.toLowerCase();
  // iOS: 1024 flattened, symbol at ~62%.
  const sym = await symbol(640, v.mono);
  await sharp({ create: { width: 1024, height: 1024, channels: 4, background: hex(v.bg) } })
    .composite([{ input: sym, gravity: 'center' }]).flatten({ background: hex(v.bg) }).removeAlpha().png().toFile(resolve(OUT, `${slug}.png`));
  // Android adaptive foreground: 1024 transparent canvas, symbol in the 66% safe zone.
  const fg = await symbol(560, v.mono);
  await sharp({ create: { width: 1024, height: 1024, channels: 4, background: { r: 0, g: 0, b: 0, alpha: 0 } } })
    .composite([{ input: fg, gravity: 'center' }]).png().toFile(resolve(OUT, `${slug}-foreground.png`));
  // Small preview for the settings picker.
  await sharp(resolve(OUT, `${slug}.png`)).resize(192, 192).png().toFile(resolve(OUT, `${slug}-preview.png`));
}
await sharp(resolve(__dirname, '../assets/branding/icon.png')).resize(192, 192).png().toFile(resolve(OUT, 'default-preview.png'));
console.log('alt icons:', VARIANTS.map((v) => v.name).join(', '));
