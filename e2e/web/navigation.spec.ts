import { test, expect } from '@playwright/test';
import { enterAsGuest, deploy, resetDeploy, go, views } from './helpers';

test.beforeEach(async ({ request }) => {
  await resetDeploy(request);
});

test.describe('hash navigation', () => {
  test('lazy views render on first navigation', async ({ page }) => {
    await enterAsGuest(page);
    await expect(views.today(page)).toBeVisible();
    for (const v of ['notes', 'habits', 'calendar', 'settings', 'dashboard', 'today'] as const) {
      await go(page, v);
      await expect(views[v](page), `#${v} should render`).toBeVisible();
    }
  });

  test('refresh keeps the current view', async ({ page }) => {
    await enterAsGuest(page);
    await go(page, 'calendar');
    await expect(views.calendar(page)).toBeVisible();
    await page.reload();
    await expect(views.calendar(page)).toBeVisible();
    await go(page, 'notes');
    await expect(views.notes(page)).toBeVisible();
    await page.reload();
    await expect(views.notes(page)).toBeVisible();
  });

  test('back and forward move between views', async ({ page }) => {
    await enterAsGuest(page);
    await expect(views.today(page)).toBeVisible();
    await go(page, 'habits');
    await expect(views.habits(page)).toBeVisible();
    await go(page, 'notes');
    await expect(views.notes(page)).toBeVisible();
    await go(page, 'calendar');
    await expect(views.calendar(page)).toBeVisible();
    await page.goBack();
    await expect(views.notes(page)).toBeVisible();
    await page.goBack();
    await expect(views.habits(page)).toBeVisible();
    await page.goBack();
    await expect(views.today(page)).toBeVisible();
    await page.goForward();
    await expect(views.habits(page)).toBeVisible();
    await page.goForward();
    await expect(views.notes(page)).toBeVisible();
  });

  test('direct load of nested hash URLs (#notes/<id>, #project/<id>)', async ({ page, context }) => {
    await enterAsGuest(page);

    // A real note: create the sample vault, which opens "Welcome" at #notes/<id>.
    await go(page, 'notes');
    await page.getByRole('button', { name: /Create sample notes/ }).first().click();
    await expect(page).toHaveURL(/#notes\/.+/);
    const noteUrl = page.url();

    // A real project via the sidebar.
    await page.getByRole('button', { name: 'Add project' }).click();
    await page.getByRole('dialog').getByRole('textbox').first().fill('E2E Project');
    await page.getByRole('dialog').getByRole('button', { name: 'Add', exact: true }).click();
    await expect(page).toHaveURL(/#project\/.+/);
    const projectUrl = page.url();

    const fresh = await context.newPage();
    await fresh.goto(noteUrl);
    await expect(views.notes(fresh)).toBeVisible();
    await expect(fresh).toHaveURL(noteUrl);
    await expect(fresh.getByRole('tab', { name: /^Welcome/, selected: true })).toBeVisible();

    await fresh.goto(projectUrl);
    await expect(fresh.getByRole('heading', { name: 'E2E Project' })).toBeVisible();
    await expect(fresh).toHaveURL(projectUrl);
  });
});

test.describe('after a deploy (old chunk hashes are gone)', () => {
  // Reproduces "the page only shows up after a manual refresh": the open tab was
  // built against the previous deploy, so its lazy chunk URLs no longer exist.
  for (const v of ['notes', 'habits', 'calendar'] as const) {
    test(`navigating to #${v} still renders without a manual reload`, async ({ page, request }) => {
      await enterAsGuest(page);
      await expect(views.today(page)).toBeVisible();
      await deploy(request);
      await go(page, v);
      await expect(views[v](page), `#${v} should render after a deploy`).toBeVisible({ timeout: 20_000 });
    });
  }

  test('a missing chunk is a 404, not the SPA index.html (vercel.json rewrite)', async ({ request }) => {
    const res = await request.get('/assets/does-not-exist-abc123.js');
    expect(res.status()).toBe(404);
    // SPA routes still get index.html
    const route = await request.get('/oauth/authorize?client_id=x');
    expect(route.status()).toBe(200);
    expect(route.headers()['content-type']).toContain('text/html');
  });

  test('two deploys in a row, then navigate between several views', async ({ page, request }) => {
    await enterAsGuest(page);
    await go(page, 'habits');
    await expect(views.habits(page)).toBeVisible();
    await deploy(request);
    await go(page, 'notes');
    await expect(views.notes(page)).toBeVisible({ timeout: 20_000 });
    await deploy(request);
    await go(page, 'calendar');
    await expect(views.calendar(page)).toBeVisible({ timeout: 20_000 });
    await go(page, 'habits');
    await expect(views.habits(page)).toBeVisible({ timeout: 20_000 });
  });
});
