import { expect, type Page, type APIRequestContext } from '@playwright/test';

/** Get past AuthView with a local (guest) workspace — no credentials needed. */
export async function enterAsGuest(page: Page, hash = '') {
  await page.goto(`/${hash}`);
  await page.getByRole('button', { name: /Local Workspace/ }).first().click();
  await page.getByPlaceholder('Enter your nickname').fill('E2E');
  await page.getByRole('button', { name: /Start Local Workspace/ }).click();
  await expect(page.locator('main')).toBeVisible();
}

/** Simulate a production deploy: every hashed /assets/* file gets a new name. */
export async function deploy(request: APIRequestContext) {
  const res = await request.post('/__e2e/deploy');
  expect(res.ok()).toBeTruthy();
}

export async function resetDeploy(request: APIRequestContext) {
  await request.post('/__e2e/reset');
}

export async function go(page: Page, hash: string) {
  await page.evaluate((h) => { window.location.hash = h; }, hash);
}

/** Visible markers that prove a view actually rendered (not a spinner, not blank). */
export const views = {
  today: (p: Page) => p.getByRole('heading', { name: 'Today', exact: true }).first(),
  notes: (p: Page) => p.getByRole('tablist', { name: 'Left sidebar' }).first(),
  habits: (p: Page) => p.getByRole('heading', { name: 'Habit Tracker' }).first(),
  calendar: (p: Page) => p.getByRole('heading', { name: 'Calendar', exact: true }).first(),
  settings: (p: Page) => p.getByRole('heading', { name: 'Settings', exact: true }).first(),
  journal: (p: Page) => p.getByRole('heading', { name: 'Journal', exact: true }).first(),
  insights: (p: Page) => p.getByRole('heading', { name: 'Insights', exact: true }).first(),
  projects: (p: Page) => p.getByRole('heading', { name: 'Projects & plans', exact: true }).first(),
};
