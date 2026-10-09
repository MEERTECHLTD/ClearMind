import { test, expect, type Page } from '@playwright/test';
import { enterAsGuest, resetDeploy, go, views } from './helpers';

/**
 * The unified web IA (one product, not two systems): grouped sidebar with
 * Notes in the primary nav, Journal / Insights / Applications tabs, the
 * Dashboard folded into Today, and one project record with Tasks | Plan.
 */
test.beforeEach(async ({ request }) => {
  await resetDeploy(request);
});

const sidebar = (p: Page) => p.locator('aside nav');

test('sidebar: Notes in the primary group, grouped tools, no legacy entries', async ({ page }) => {
  await enterAsGuest(page);
  const nav = sidebar(page);
  const primary = nav.locator('ul').first();
  for (const name of ['Search', 'Inbox', 'Today', 'Upcoming', 'Notes', 'Filters & Labels', 'Completed', 'Insights', 'Activity', 'Templates']) {
    await expect(primary.getByRole('button', { name: new RegExp(`^${name.replace(/[&]/g, '\\$&')}`) })).toBeVisible();
  }
  for (const group of ['Plan', 'Think', 'Grow']) {
    await expect(nav.getByRole('button', { name: group, exact: true })).toBeVisible();
  }
  for (const name of ['Calendar', 'Daily Mapper', 'Goals', 'Milestones', 'Habits', 'Journal', 'Iris (AI)', 'Applications', 'Learning Vault']) {
    await expect(nav.getByRole('button', { name, exact: true })).toHaveCount(1);
  }
  await expect(nav.getByRole('button', { name: 'All projects & plans' })).toBeVisible();
  for (const gone of ['Dashboard', 'Project planner', 'AI Reviewer', 'Mind Map', 'Rant Corner', 'Daily Log', 'Analytics', 'Productivity', 'Settings']) {
    await expect(nav.getByRole('button', { name: gone, exact: true })).toHaveCount(0);
  }
  // Notes opens the vault from the primary group.
  await primary.getByRole('button', { name: 'Notes' }).click();
  await expect(views.notes(page)).toBeVisible();
  await expect(page).toHaveURL(/#notes/);
});

test('collapsed sidebar keeps labelled icon buttons', async ({ page }) => {
  await enterAsGuest(page);
  await page.getByRole('button', { name: 'Collapse sidebar' }).click();
  const nav = sidebar(page);
  await expect(nav.getByRole('button', { name: 'Notes', exact: true })).toBeVisible();
  await expect(nav.getByRole('button', { name: 'Journal', exact: true })).toBeVisible();
  await expect(nav.getByRole('button', { name: 'All projects & plans', exact: true })).toBeVisible();
  await nav.getByRole('button', { name: 'Journal', exact: true }).click();
  await expect(views.journal(page)).toBeVisible();
});

test('old routes redirect: #dashboard → #today, #analytics → Insights Life, #productivity, #rant, #dailylog, #reviewer', async ({ page }) => {
  await enterAsGuest(page);
  await go(page, 'dashboard');
  await expect(page).toHaveURL(/#today$/);
  await expect(views.today(page)).toBeVisible();

  await go(page, 'analytics');
  await expect(page).toHaveURL(/#insights\?tab=life$/);
  await expect(views.insights(page)).toBeVisible();
  await expect(page.getByRole('radio', { name: 'Life' })).toHaveAttribute('aria-checked', 'true');

  await go(page, 'productivity');
  await expect(page).toHaveURL(/#insights\?tab=tasks$/);
  await expect(page.getByRole('radio', { name: 'Tasks' })).toHaveAttribute('aria-checked', 'true');

  await go(page, 'rant');
  await expect(page).toHaveURL(/#journal\?tab=rants$/);
  await expect(page.getByRole('radio', { name: 'Rants' })).toHaveAttribute('aria-checked', 'true');

  await go(page, 'dailylog');
  await expect(page).toHaveURL(/#journal\?tab=log$/);
  await expect(page.getByRole('radio', { name: 'Daily log' })).toHaveAttribute('aria-checked', 'true');

  await go(page, 'reviewer');
  await expect(page).toHaveURL(/#applications\?tab=reviewer$/);
  await expect(page.getByRole('tab', { name: 'AI Reviewer', selected: true })).toBeVisible();

  // A redirect replaces history: Back skips the old route.
  await go(page, 'habits');
  await expect(views.habits(page)).toBeVisible();
  await go(page, 'dashboard');
  await expect(page).toHaveURL(/#today$/);
  await page.goBack();
  await expect(views.habits(page)).toBeVisible();
});

test('#journal tabs: write a log, switch to Rants, turn an entry into a task', async ({ page }) => {
  await enterAsGuest(page);
  await go(page, 'journal');
  await expect(views.journal(page)).toBeVisible();
  await page.getByRole('textbox', { name: 'Today’s log' }).fill('Shipped the unified sidebar\nIt took a while');
  await page.getByRole('button', { name: 'Save entry' }).click();
  await expect(page.getByText('Shipped the unified sidebar', { exact: false }).first()).toBeVisible();

  await page.getByRole('button', { name: 'Turn into task' }).first().click();
  const dialog = page.getByRole('dialog', { name: 'Quick add' });
  await expect(dialog.getByRole('textbox', { name: 'Task name' })).toHaveValue('Shipped the unified sidebar');
  await dialog.getByRole('button', { name: 'Cancel' }).click();

  await page.getByRole('radio', { name: 'Rants' }).click();
  await expect(page).toHaveURL(/#journal\?tab=rants$/);
  await expect(page.getByRole('textbox', { name: 'Rant' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Get advice from Iris' })).toBeVisible();
});

test('#insights tabs switch between Tasks and Life', async ({ page }) => {
  await enterAsGuest(page);
  await go(page, 'insights');
  await expect(views.insights(page)).toBeVisible();
  await expect(page.getByText('MOMENTUM', { exact: true })).toBeVisible();
  await page.getByRole('radio', { name: 'Life' }).click();
  await expect(page).toHaveURL(/#insights\?tab=life$/);
  await expect(page.getByText('All-time completion rate')).toBeVisible();
  await page.getByRole('radio', { name: 'Tasks' }).click();
  await expect(page.getByText('MOMENTUM', { exact: true })).toBeVisible();
});

test('project page has a Tasks | Plan switch and the plan is editable', async ({ page }) => {
  await enterAsGuest(page);
  await page.getByRole('button', { name: 'Add project' }).click();
  await page.getByRole('dialog').getByRole('textbox').first().fill('Unified Project');
  await page.getByRole('dialog').getByRole('button', { name: 'Add', exact: true }).click();
  await expect(page).toHaveURL(/#project\/.+/);
  await expect(page.getByRole('radio', { name: 'Tasks' })).toHaveAttribute('aria-checked', 'true');

  await page.getByRole('radio', { name: 'Plan' }).click();
  await expect(page).toHaveURL(/#project\/.+\?tab=plan$/);
  await page.getByRole('button', { name: 'Edit plan' }).click();
  const dialog = page.getByRole('dialog', { name: 'Edit plan' });
  await dialog.locator('select').first().selectOption('On Hold');
  await dialog.getByRole('button', { name: 'Save plan' }).click();
  await expect(page.getByText('On Hold', { exact: true }).first()).toBeVisible();
  await expect(page.getByRole('button', { name: /Phases/ })).toBeVisible();

  // Direct load lands on the Plan tab; the portfolio lists the same project.
  await page.reload();
  await expect(page.getByRole('radio', { name: 'Plan' })).toHaveAttribute('aria-checked', 'true');
  await go(page, 'projects');
  await expect(views.projects(page)).toBeVisible();
  await page.getByRole('button', { name: 'Open Unified Project' }).click();
  await expect(page).toHaveURL(/#project\/.+\?tab=plan$/);
});

test('Mind maps are reachable from Notes and #mindmap still works', async ({ page }) => {
  await enterAsGuest(page);
  await go(page, 'notes');
  await expect(views.notes(page)).toBeVisible();
  await page.getByRole('button', { name: 'Mind maps' }).first().click();
  await expect(page).toHaveURL(/#mindmap$/);
});
