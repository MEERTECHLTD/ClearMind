/**
 * Captures the real ClearMind web app for the /welcome landing page and writes
 * responsive WebP files to public/landing/. The shots come from the production
 * bundle in a Local Workspace (guest, no account), filled through the normal
 * UI: Quick Add for tasks and the Notes "Create sample notes" action.
 *
 *   npm run build && E2E_PORT=4199 node e2e/web/server.mjs &
 *   node scripts/capture-landing-shots.mjs            # BASE_URL defaults to http://127.0.0.1:4199
 */
import { chromium } from '@playwright/test';
import sharp from 'sharp';
import fs from 'node:fs';
import path from 'node:path';

const BASE = process.env.BASE_URL || 'http://127.0.0.1:4199';
// THEME=light|dark (default dark); the landing page picks one with prefers-color-scheme.
const THEME = process.env.THEME === 'light' ? 'light' : 'dark';
const OUT = path.resolve(import.meta.dirname, '../public/landing');
fs.mkdirSync(OUT, { recursive: true });

const TASKS = [
  'Draft the Q4 product brief today at 10am p1 #Launch @writing',
  'Review onboarding copy today at 2pm p2 #Launch',
  'Weekly planning every friday at 4pm #Personal',
  'Book dentist appointment today p3 #Personal',
  'Send invoice to studio tomorrow at 9am p2 #Freelance @admin',
];

async function enter(page) {
  await page.goto(`${BASE}/#today`);
  await page.getByRole('button', { name: /Local Workspace/ }).first().click();
  await page.getByPlaceholder('Enter your nickname').fill('Ada');
  await page.getByRole('button', { name: /Start Local Workspace/ }).click();
  await page.locator('main').waitFor();
  await page.locator('main').getByRole('button', { name: 'Add task' }).click();
  const box = page.getByLabel('Task name');
  for (const t of TASKS) {
    await box.fill(t);
    await box.press('Enter');
    await page.waitForTimeout(300);
  }
  await page.keyboard.press('Escape');
  await page.waitForTimeout(600);
}

/** PNG buffer -> name-<w>.webp at each width. */
async function save(buf, name, widths) {
  for (const w of widths) {
    await sharp(buf).resize({ width: w }).webp({ quality: 82 }).toFile(path.join(OUT, `${name}-${w}.webp`));
  }
}

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1280, height: 800 }, deviceScaleFactor: 2, colorScheme: THEME });
await page.addInitScript((THEME_PREF) => { try { localStorage.setItem('cm.themePref', THEME_PREF); } catch {} }, THEME);
await enter(page);
await save(await page.screenshot(), `today-${THEME}`, [640, 1280, 2560]);

await page.getByRole('button', { name: 'Upcoming', exact: true }).first().click();
await page.waitForTimeout(800);
await save(await page.screenshot(), `upcoming-${THEME}`, [640, 1280]);

await page.getByRole('button', { name: 'Notes', exact: true }).first().click();
await page.getByRole('button', { name: 'Create sample notes' }).first().click();
await page.getByText('Sample notes created').waitFor({ state: 'hidden', timeout: 20_000 }).catch(() => {});
await page.waitForTimeout(500);
await save(await page.screenshot(), `notes-${THEME}`, [640, 1280]);

await page.getByRole('button', { name: 'Open graph view' }).first().click();
await page.waitForTimeout(2500); // let the force layout settle
await save(await page.screenshot(), `graph-${THEME}`, [640, 1280]);

await browser.close();
console.log(`wrote ${fs.readdirSync(OUT).length} files to ${OUT}`);
