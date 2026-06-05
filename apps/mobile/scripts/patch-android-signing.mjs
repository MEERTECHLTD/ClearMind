// Idempotent Android release-signing patch — for the GRADLE FALLBACK CI path only
// (the primary workflow uses `eas build --local`, which injects signing from
// credentials.json and does not need this). Because `expo prebuild` regenerates
// android/ on every run, this must run each CI run and be safe to re-apply.
//
// It adds a `release` signingConfig that reads from gradle.properties
// (CLEARMIND_UPLOAD_* — injected by CI) and points the release buildType at it.
//
// Usage (after `expo prebuild --platform android`): node scripts/patch-android-signing.mjs
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const gradlePath = resolve(__dirname, '../android/app/build.gradle');
const MARKER = '// CLEARMIND_SIGNING_PATCH';

if (!existsSync(gradlePath)) {
  console.error(`✗ ${gradlePath} not found — run \`expo prebuild --platform android\` first.`);
  process.exit(1);
}

let gradle = readFileSync(gradlePath, 'utf8');

if (gradle.includes(MARKER)) {
  console.log('✓ build.gradle already patched — nothing to do (idempotent).');
  process.exit(0);
}

// 1) Add a `release` signingConfig inside the existing `signingConfigs { ... }`.
const releaseSigningConfig = `signingConfigs {
        ${MARKER}
        release {
            if (project.hasProperty('CLEARMIND_UPLOAD_STORE_FILE')) {
                storeFile file(CLEARMIND_UPLOAD_STORE_FILE)
                storePassword CLEARMIND_UPLOAD_STORE_PASSWORD
                keyAlias CLEARMIND_UPLOAD_KEY_ALIAS
                keyPassword CLEARMIND_UPLOAD_KEY_PASSWORD
            }
        }`;

if (!/signingConfigs\s*\{/.test(gradle)) {
  console.error('✗ Could not find a `signingConfigs {` block in build.gradle.');
  process.exit(1);
}
gradle = gradle.replace(/signingConfigs\s*\{/, releaseSigningConfig);

// 2) Point the RELEASE buildType at signingConfigs.release. The release block
//    comes after the debug block, so lazily skip to `release {` first, then swap
//    its `signingConfig signingConfigs.debug`.
const before = gradle;
gradle = gradle.replace(
  /(buildTypes\s*\{[\s\S]*?release\s*\{[\s\S]*?)signingConfig\s+signingConfigs\.debug/,
  '$1signingConfig signingConfigs.release'
);
if (gradle === before) {
  console.error('✗ Could not rewrite the release buildType signingConfig — inspect android/app/build.gradle.');
  process.exit(1);
}

writeFileSync(gradlePath, gradle);
console.log('✓ Patched android/app/build.gradle with the release signingConfig.');
