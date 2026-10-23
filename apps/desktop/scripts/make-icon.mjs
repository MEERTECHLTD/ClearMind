// Builds build/icon.icns from the 1024px brand icon the mobile apps use
// (apps/mobile/assets/branding/icon.png), on Apple's macOS icon grid: an
// 824px rounded square centred on a transparent 1024px canvas. Needs macOS
// (iconutil) and `sharp` (root devDependency).
import sharp from 'sharp';
import { execFileSync } from 'node:child_process';
import { mkdirSync, rmSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const src = path.resolve(root, '../mobile/assets/branding/icon.png');
const set = path.join(root, 'build/icon.iconset');
const SIZE = 824, RADIUS = 185;

const mask = Buffer.from(`<svg width="${SIZE}" height="${SIZE}"><rect width="${SIZE}" height="${SIZE}" rx="${RADIUS}" ry="${RADIUS}"/></svg>`);
const tile = await sharp(src).resize(SIZE, SIZE).composite([{ input: mask, blend: 'dest-in' }]).png().toBuffer();
const master = await sharp({ create: { width: 1024, height: 1024, channels: 4, background: { r: 0, g: 0, b: 0, alpha: 0 } } })
  .composite([{ input: tile, left: 100, top: 100 }]).png().toBuffer();

rmSync(set, { recursive: true, force: true });
mkdirSync(set, { recursive: true });
for (const s of [16, 32, 128, 256, 512]) {
  await sharp(master).resize(s, s).toFile(path.join(set, `icon_${s}x${s}.png`));
  await sharp(master).resize(s * 2, s * 2).toFile(path.join(set, `icon_${s}x${s}@2x.png`));
}
execFileSync('iconutil', ['-c', 'icns', set, '-o', path.join(root, 'build/icon.icns')]);
await sharp(master).resize(512, 512).toFile(path.join(root, 'build/icon.png'));
rmSync(set, { recursive: true, force: true });
console.log('wrote build/icon.icns and build/icon.png');
