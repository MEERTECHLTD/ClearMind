import { test, expect, type Page } from '@playwright/test';
import { enterAsGuest, deploy, resetDeploy, go, views } from './helpers';

test.beforeEach(async ({ request }) => {
  await resetDeploy(request);
});

const waitForController = (page: Page) =>
  page.waitForFunction(() => !!navigator.serviceWorker.controller, undefined, { timeout: 15_000 });

const swVersion = (page: Page) =>
  page.evaluate(
    () =>
      new Promise<string>((resolve) => {
        const ch = new MessageChannel();
        ch.port1.onmessage = (e) => resolve(e.data);
        navigator.serviceWorker.controller!.postMessage({ type: 'GET_VERSION' }, [ch.port2]);
      }),
  );

const cacheContents = (page: Page) =>
  page.evaluate(async () => {
    const out: { cache: string; url: string; type: string | null }[] = [];
    for (const name of await caches.keys()) {
      const cache = await caches.open(name);
      for (const req of await cache.keys()) {
        const res = await cache.match(req);
        out.push({ cache: name, url: req.url, type: res?.headers.get('content-type') ?? null });
      }
    }
    return out;
  });

test.describe('service worker', () => {
  test('caches only same-origin shell/assets with matching types, survives a deploy', async ({ page, request }) => {
    await enterAsGuest(page);
    await waitForController(page);
    await go(page, 'notes');
    await expect(views.notes(page)).toBeVisible();
    await deploy(request);
    await go(page, 'calendar'); // old chunk is gone -> retry -> one reload onto the new build
    await expect(views.calendar(page)).toBeVisible({ timeout: 20_000 });

    const entries = await cacheContents(page);
    expect(entries.length).toBeGreaterThan(3);
    const origin = new URL(page.url()).origin;
    for (const e of entries) {
      expect(e.cache, 'one versioned cache per build').toMatch(/^clearmind-[0-9a-f]{12}$/);
      expect(new URL(e.url).origin, `no cross-origin entries (${e.url})`).toBe(origin);
      expect(new URL(e.url).pathname.startsWith('/api/'), 'never caches /api').toBe(false);
      if (e.url.endsWith('.js')) expect(e.type, `${e.url} must be JS`).toContain('javascript');
      if (e.url.endsWith('.css')) expect(e.type).toContain('text/css');
    }
    expect(entries.some((e) => e.url.endsWith('/index.html') && e.type?.includes('text/html'))).toBe(true);
  });

  test('new deploy shows "New version available" and Reload switches to it', async ({ page, request }) => {
    await enterAsGuest(page);
    await waitForController(page);
    const before = await swVersion(page);

    await deploy(request);
    await page.evaluate(async () => { await (await navigator.serviceWorker.getRegistration())!.update(); });
    const prompt = page.getByRole('status').filter({ hasText: 'New version available' });
    await expect(prompt).toBeVisible();

    await Promise.all([page.waitForEvent('load'), prompt.getByRole('button', { name: 'Reload' }).click()]);
    await waitForController(page);
    await expect.poll(() => swVersion(page)).not.toBe(before);
    const entry = await page.evaluate(() => document.querySelector<HTMLScriptElement>('script[type="module"][src*="/assets/"]')!.src);
    expect(entry).toMatch(/g1\.js$/); // the simulated deploy's renamed entry chunk
    await expect(views.today(page)).toBeVisible();
    await expect(prompt).toHaveCount(0);
  });

  test('offline: the app shell and visited views load from the cache', async ({ page, context }) => {
    await enterAsGuest(page);
    await waitForController(page);
    await go(page, 'notes');
    await expect(views.notes(page)).toBeVisible();
    await page.waitForTimeout(500); // let the cache.put for the chunk settle
    await context.setOffline(true);
    await page.reload();
    await expect(views.notes(page)).toBeVisible();
    await context.setOffline(false);
  });
});

test.describe('headers and manifest', () => {
  test('cache and security headers', async ({ request, page }) => {
    const html = await request.get('/');
    expect(html.headers()['cache-control']).toBe('no-cache');
    expect(html.headers()['x-content-type-options']).toBe('nosniff');
    expect(html.headers()['x-frame-options']).toBe('DENY');
    expect(html.headers()['referrer-policy']).toBe('strict-origin-when-cross-origin');
    expect(html.headers()['content-security-policy-report-only']).toContain("frame-ancestors 'none'");
    expect((await request.get('/sw.js')).headers()['cache-control']).toBe('no-cache');
    await page.goto('/');
    const entry = await page.evaluate(() => document.querySelector<HTMLScriptElement>('script[type="module"][src*="/assets/"]')!.getAttribute('src')!);
    expect((await request.get(entry)).headers()['cache-control']).toBe('public, max-age=31536000, immutable');
  });

  test('no CSP (report-only) violations while using the app locally', async ({ page }) => {
    const violations: string[] = [];
    page.on('console', (m) => { if (/Content.Security.Policy/i.test(m.text())) violations.push(m.text()); });
    await enterAsGuest(page);
    for (const v of ['notes', 'habits', 'calendar', 'settings', 'journal', 'insights', 'projects', 'today'] as const) {
      await go(page, v);
      await expect(views[v](page)).toBeVisible();
    }
    expect(violations).toEqual([]);
  });

  test('manifest is installable and its icons are real PNGs of the declared size', async ({ request }) => {
    const m = await (await request.get('/manifest.json')).json();
    expect(m.name).toBe('ClearMind');
    expect(m.short_name).toBe('ClearMind');
    expect(m.display).toBe('standalone');
    expect(m.start_url).toBeTruthy();
    expect(m.scope).toBe('/');
    expect(m.id).toBeTruthy();
    expect(m.background_color).toBe('#05050A');
    const purposes = new Set<string>();
    for (const icon of m.icons) {
      const res = await request.get(icon.src);
      expect(res.status(), icon.src).toBe(200);
      const buf = await res.body();
      expect(buf.subarray(1, 4).toString(), `${icon.src} is a PNG`).toBe('PNG');
      const w = buf.readUInt32BE(16), h = buf.readUInt32BE(20);
      expect(`${w}x${h}`, icon.src).toBe(icon.sizes);
      purposes.add(icon.purpose ?? 'any');
    }
    expect(purposes.has('any')).toBe(true);
    expect(purposes.has('maskable')).toBe(true);
    const sizes = m.icons.map((i: { sizes: string }) => i.sizes);
    expect(sizes).toContain('192x192');
    expect(sizes).toContain('512x512');
    const touch = await request.get('/apple-touch-icon.png');
    expect(touch.status()).toBe(200);
  });
});

test.describe('install button', () => {
  test('Chromium/Edge desktop: uses the native install prompt', async ({ page }) => {
    await enterAsGuest(page);
    const button = page.getByRole('button', { name: 'Install App' });
    await expect(button).toHaveCount(0); // no prompt event yet -> no button
    await page.evaluate(() => {
      const e = new Event('beforeinstallprompt', { cancelable: true }) as Event & { prompt: () => Promise<void>; userChoice: Promise<unknown> };
      e.prompt = async () => { (window as unknown as { __prompted: boolean }).__prompted = true; };
      e.userChoice = Promise.resolve({ outcome: 'dismissed' });
      window.dispatchEvent(e);
    });
    await button.click();
    expect(await page.evaluate(() => (window as unknown as { __prompted?: boolean }).__prompted)).toBe(true);
  });

  test.describe('Safari on macOS', () => {
    test.use({ userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.4 Safari/605.1.15' });
    test('shows File → Add to Dock instructions', async ({ page }) => {
      await enterAsGuest(page);
      await page.getByRole('button', { name: 'Install App' }).click();
      const dialog = page.getByRole('dialog', { name: 'Install ClearMind' });
      await expect(dialog).toContainText('Add to Dock');
      await dialog.getByRole('button', { name: 'Got it' }).click();
      await expect(dialog).toHaveCount(0);
    });
  });

  test.describe('Android', () => {
    test.use({ userAgent: 'Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Mobile Safari/537.36', viewport: { width: 1024, height: 800 } });
    test('offers the Play Store app', async ({ page, context }) => {
      await context.route('https://play.google.com/**', (r) => r.fulfill({ status: 200, body: 'play' }));
      await enterAsGuest(page);
      const [popup] = await Promise.all([
        context.waitForEvent('page'),
        page.getByRole('button', { name: 'Get the App' }).click(),
      ]);
      expect(popup.url()).toContain('play.google.com/store/apps/details?id=tech.meertech.clearmind');
    });
  });

  test.describe('Firefox desktop', () => {
    test.use({ userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 14.5; rv:128.0) Gecko/20100101 Firefox/128.0' });
    test('has no install button (no web-app install support)', async ({ page }) => {
      await enterAsGuest(page);
      await expect(views.today(page)).toBeVisible();
      await expect(page.getByRole('button', { name: /Install App|Get the App/ })).toHaveCount(0);
    });
  });
});
