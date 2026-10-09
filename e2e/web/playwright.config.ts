import { defineConfig, devices } from '@playwright/test';

/**
 * Web e2e suite. Runs against the PRODUCTION bundle (`dist/`, built by
 * `npm run test:e2e:web`) served by e2e/web/server.mjs, which applies
 * vercel.json the way Vercel does (filesystem first, then rewrites, then 404,
 * plus the `headers` rules) and can simulate a redeploy.
 *
 * Tests share one server whose "deployed build" is global state, so they run
 * serially in a single worker.
 */
const PORT = Number(process.env.E2E_PORT || 4173);

export default defineConfig({
  testDir: '.',
  testMatch: /.*\.spec\.ts$/,
  fullyParallel: false,
  workers: 1,
  retries: process.env.CI ? 1 : 0,
  timeout: 60_000,
  expect: { timeout: 15_000 },
  reporter: process.env.CI ? [['list'], ['html', { open: 'never' }]] : 'list',
  use: {
    baseURL: `http://127.0.0.1:${PORT}`,
    trace: 'retain-on-failure',
    ...devices['Desktop Chrome'],
  },
  webServer: {
    command: 'node e2e/web/server.mjs',
    cwd: '../..',
    url: `http://127.0.0.1:${PORT}/manifest.json`,
    reuseExistingServer: false,
    env: { E2E_PORT: String(PORT) },
    stdout: 'pipe',
  },
});
