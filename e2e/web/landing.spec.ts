import { test, expect, type Page } from '@playwright/test';

/** Console errors and failed same-origin requests while `fn` runs. */
async function collectProblems(page: Page, fn: () => Promise<void>) {
  const problems: string[] = [];
  page.on('console', (m) => { if (m.type() === 'error') problems.push(`console: ${m.text()}`); });
  page.on('pageerror', (e) => problems.push(`pageerror: ${e.message}`));
  page.on('response', (r) => {
    if (r.url().startsWith('http://127.0.0.1') && r.status() >= 400) problems.push(`${r.status()} ${r.url()}`);
  });
  await fn();
  return problems;
}

test('landing renders at /welcome/ with no console errors or broken assets', async ({ page }) => {
  const problems = await collectProblems(page, async () => {
    await page.goto('/welcome/');
    await expect(page.getByRole('heading', { level: 1 })).toContainText('in one calm place');
    await page.evaluate(async () => {
      for (let y = 0; y < document.body.scrollHeight; y += 600) { window.scrollTo({ top: y, behavior: 'instant' }); await new Promise((r) => setTimeout(r, 30)); }
    });
    await page.waitForLoadState('networkidle');
  });
  expect(problems).toEqual([]);
  // Every image actually decoded.
  const broken = await page.locator('img').evaluateAll((imgs) => (imgs as HTMLImageElement[]).filter((i) => i.complete && i.naturalWidth === 0).map((i) => i.src));
  expect(broken).toEqual([]);
  await expect(page).toHaveTitle(/ClearMind/);
  await expect(page.locator('link[rel="canonical"]')).toHaveAttribute('href', 'https://clearmind.one/welcome/');
});

test('/welcome without a trailing slash serves the landing page', async ({ page }) => {
  await page.goto('/welcome');
  await expect(page.getByRole('heading', { level: 1 })).toContainText('in one calm place');
});

test('in-page links point at real sections', async ({ page }) => {
  await page.goto('/welcome/');
  const hashes = await page.locator('a[href^="#"]').evaluateAll((as) => [...new Set(as.map((a) => a.getAttribute('href')!))]);
  expect(hashes.length).toBeGreaterThan(4);
  for (const h of hashes) await expect(page.locator(h)).toHaveCount(1);
});

test('same-origin pages linked from the landing page exist', async ({ page, request }) => {
  await page.goto('/welcome/');
  const paths = await page.locator('a[href^="/"]').evaluateAll((as) => [...new Set(as.map((a) => a.getAttribute('href')!.split('?')[0]))]);
  for (const p of paths) {
    const res = await request.get(p);
    expect(res.status(), p).toBe(200);
    // The SPA fallback answers 200 for anything — check the static pages are the real files.
    if (p.endsWith('.html')) expect(await res.text(), p).not.toContain('<div id="root">');
  }
});

test('Quick Add demo runs the real parser', async ({ page }) => {
  await page.goto('/welcome/');
  const input = page.getByLabel('Quick Add');
  await input.fill('Pay rent every month p1 #Home @bills');
  const out = page.locator('.lp-demo-output');
  await expect(out.locator('[data-qa-title]')).toHaveText('Pay rent');
  await expect(out.locator('dd').nth(1)).toHaveText('Every month');
  await expect(out.locator('dd').nth(2)).toHaveText('P1 · High');
  await expect(out.locator('dd').nth(3)).toHaveText('Home');
  await expect(out.locator('dd').nth(4)).toHaveText('bills');
  await page.getByRole('button', { name: 'Repeating' }).click();
  await expect(out.locator('dd').nth(1)).toHaveText('Every weekday');
});

test('screenshot tabs follow the ARIA tabs pattern', async ({ page }) => {
  await page.goto('/welcome/');
  const today = page.getByRole('tab', { name: 'Today' });
  await today.click();
  await today.press('ArrowRight');
  await expect(page.getByRole('tab', { name: 'Upcoming' })).toBeFocused();
  await expect(page.getByRole('tab', { name: 'Upcoming' })).toHaveAttribute('aria-selected', 'true');
  await expect(page.locator('#panel-upcoming')).toBeVisible();
  await expect(page.locator('#panel-today')).toBeHidden();
});

test('mobile menu opens, closes with Escape, and its links navigate', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/welcome/');
  const toggle = page.getByRole('button', { name: 'Menu' });
  await expect(toggle).toHaveAttribute('aria-expanded', 'false');
  await toggle.click();
  await expect(toggle).toHaveAttribute('aria-expanded', 'true');
  await expect(page.locator('#lp-mobile-menu')).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(page.locator('#lp-mobile-menu')).toBeHidden();
  await expect(toggle).toBeFocused();
  await toggle.click();
  await page.locator('#lp-mobile-menu').getByRole('link', { name: 'FAQ' }).click();
  await expect(page.locator('#lp-mobile-menu')).toBeHidden();
  await expect(page).toHaveURL(/#faq$/);
});

test('no horizontal overflow on a small phone', async ({ page }) => {
  await page.setViewportSize({ width: 360, height: 740 });
  await page.goto('/welcome/');
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
  expect(overflow).toBeLessThanOrEqual(0);
});

test('Sign in / Create account CTAs open the app auth form, and / still boots the app', async ({ page }) => {
  await page.goto('/welcome/');
  await page.getByRole('link', { name: 'Open ClearMind' }).first().click();
  await expect(page.getByRole('heading', { name: 'Welcome to ClearMind' })).toBeVisible();

  // With Firebase configured (.env.local / CI env) these open the cloud form;
  // without it cloud auth is unavailable and the app stays on the chooser.
  const configured = await page.getByRole('button', { name: /Cloud Sync/ }).isEnabled();
  for (const [link, heading] of [['Create account', 'Create Account'], ['Sign in', 'Sign In']] as const) {
    await page.goto('/welcome/');
    await page.locator('footer').getByRole('link', { name: link }).click();
    await expect(page.getByRole('heading', { name: configured ? heading : 'Welcome to ClearMind', exact: true })).toBeVisible();
    await expect(page).not.toHaveURL(/auth=/);
  }
});

test('first visit to / shows the landing page; returning visitors and deep links get the app', async ({ page }) => {
  await page.goto('/');
  await expect(page).toHaveURL(/\/welcome\/$/);
  await expect(page.getByRole('heading', { level: 1 })).toBeVisible();

  // Deep links and sign-in links never bounce to the landing page.
  await page.goto('/#today');
  await expect(page.getByRole('heading', { name: 'Welcome to ClearMind' })).toBeVisible();
  // Having opened the app once, bare / stays in the app.
  await page.goto('/');
  await expect(page).not.toHaveURL(/welcome/);
  await expect(page.getByRole('heading', { name: 'Welcome to ClearMind' })).toBeVisible();
});

test('landing page follows the system light/dark setting', async ({ page }) => {
  await page.emulateMedia({ colorScheme: 'light' });
  await page.goto('/welcome/');
  const light = await page.evaluate(() => getComputedStyle(document.body).backgroundColor);
  const heroLight = await page.locator('.lp-window img').evaluate((i: HTMLImageElement) => i.currentSrc);
  await page.emulateMedia({ colorScheme: 'dark' });
  await page.reload();
  const dark = await page.evaluate(() => getComputedStyle(document.body).backgroundColor);
  expect(light).toBe('rgb(248, 250, 252)');
  expect(dark).toBe('rgb(5, 5, 10)');
  expect(heroLight).toContain('-light-');
});

test('landing copy has no em or en dashes', async ({ page }) => {
  await page.goto('/welcome/');
  const text = await page.evaluate(() => document.body.innerText + document.title);
  expect(text).not.toMatch(/[–—]/);
});
