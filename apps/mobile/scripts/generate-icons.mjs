// Generate the mobile app's branding assets from the web logo, so iOS/Android
// inherit the real ClearMind brand (head + lightbulb) — NOT a placeholder.
//
// Source of truth: ../../../public/clearmindlogo.png (the actual logo shown in the
// web app's Sidebar/Auth screens). The other public/icon-*.png are a generic
// database stock graphic and are deliberately NOT used. (See DECISIONS.md D9.)
//
// Run from the repo root: `node apps/mobile/scripts/generate-icons.mjs`
// (sharp is a root devDependency.)
import sharp from 'sharp';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import { mkdirSync } from 'node:fs';

const __dirname = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = resolve(__dirname, '../../..');
const SRC = resolve(REPO_ROOT, 'public/clearmindlogo.png');
const OUT = resolve(__dirname, '../assets/branding');
mkdirSync(OUT, { recursive: true });

// Exact web `midnight` (--bg-main, dark theme) — matches NativeWind/tailwind config.
const MIDNIGHT = { r: 5, g: 5, b: 10, alpha: 1 };
const MIDNIGHT_HEX = '#05050A';
const TRANSPARENT = { r: 0, g: 0, b: 0, alpha: 0 };

// Bounding box of the head+lightbulb SYMBOL within clearmindlogo.png (the
// "ClearMind" wordmark sits below at y 727-846 and is excluded). Detected by
// per-row alpha-coverage analysis, not eyeballed.
const SYMBOL = { left: 291, top: 139, width: 495, height: 532 };

const out = (name) => resolve(OUT, name);

// Square canvas with `inner` composited centred; optionally flattened to a bg.
const canvas = (size, bg) =>
  sharp({ create: { width: size, height: size, channels: 4, background: bg } });

async function symbolBuffer(fit) {
  // The symbol fitted (contain) into a `fit`x`fit` transparent square.
  return sharp(SRC)
    .extract(SYMBOL)
    .resize(fit, fit, { fit: 'contain', background: TRANSPARENT })
    .png()
    .toBuffer();
}

async function generate() {
  // 1) icon.png — 1024, NO transparency. Symbol on the midnight backdrop so the
  //    launcher icon is cohesive with the splash + dark app theme.
  const symFor1024 = await symbolBuffer(800);
  await canvas(1024, MIDNIGHT)
    .composite([{ input: symFor1024, gravity: 'center' }])
    .flatten({ background: MIDNIGHT_HEX })
    .removeAlpha() // iOS App Store rejects icons that carry an alpha channel
    .png()
    .toFile(out('icon.png'));

  // 2) adaptive-foreground.png — 1024, TRANSPARENT, symbol kept inside the
  //    central ~59% safe zone so nothing clips under the circular/squircle mask.
  const symFg = await symbolBuffer(600);
  await canvas(1024, TRANSPARENT)
    .composite([{ input: symFg, gravity: 'center' }])
    .png()
    .toFile(out('adaptive-foreground.png'));

  // 3) adaptive-background.png — solid midnight (also set as backgroundColor).
  await canvas(1024, MIDNIGHT).flatten({ background: MIDNIGHT_HEX }).png().toFile(out('adaptive-background.png'));

  // 4) splash.png — the FULL lockup (symbol + "ClearMind" wordmark) centred on
  //    midnight. Uses the whole logo, not the symbol crop.
  const lockup = await sharp(SRC).resize(1100, 1100, { fit: 'contain', background: TRANSPARENT }).png().toBuffer();
  await canvas(1536, MIDNIGHT)
    .composite([{ input: lockup, gravity: 'center' }])
    .flatten({ background: MIDNIGHT_HEX })
    .png()
    .toFile(out('splash.png'));

  // 5) notification-icon.png — 96, flat WHITE silhouette on transparent (Android
  //    status-bar icons must be a white-on-transparent monochrome glyph).
  const { data, info } = await sharp(SRC)
    .extract(SYMBOL)
    .resize(76, 76, { fit: 'contain', background: TRANSPARENT })
    .ensureAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });
  const white = Buffer.alloc(info.width * info.height * 4);
  for (let i = 0; i < info.width * info.height; i++) {
    white[i * 4] = 255; white[i * 4 + 1] = 255; white[i * 4 + 2] = 255;
    white[i * 4 + 3] = data[i * 4 + 3]; // keep the symbol's alpha as the glyph shape
  }
  const whiteSil = await sharp(white, { raw: { width: info.width, height: info.height, channels: 4 } }).png().toBuffer();
  await canvas(96, TRANSPARENT).composite([{ input: whiteSil, gravity: 'center' }]).png().toFile(out('notification-icon.png'));

  // 6) favicon.png — small icon for the Expo web export target (from the symbol).
  await sharp(out('icon.png')).resize(48, 48).png().toFile(out('favicon.png'));

  // Report.
  for (const name of ['icon.png', 'adaptive-foreground.png', 'adaptive-background.png', 'splash.png', 'notification-icon.png', 'favicon.png']) {
    const m = await sharp(out(name)).metadata();
    console.log(`✓ ${name.padEnd(24)} ${m.width}x${m.height} alpha=${m.hasAlpha}`);
  }
  console.log(`\nBranding written to apps/mobile/assets/branding/ (midnight ${MIDNIGHT_HEX}).`);
}

generate().catch((e) => { console.error(e); process.exit(1); });
