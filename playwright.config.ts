import { defineConfig } from '@playwright/test';

export default defineConfig({
  testDir: './tests',
  timeout: 30_000,
  expect: { timeout: 5_000 },
  fullyParallel: false,
  retries: 0,
  reporter: [['list']],

  use: {
    baseURL: 'http://localhost:8081',
    viewport: { width: 1440, height: 900 },
    deviceScaleFactor: 2,
    screenshot: 'off',
    actionTimeout: 10_000,
  },

  projects: [
    {
      name: 'desktop',
      use: { viewport: { width: 1440, height: 900 } },
    },
  ],

  webServer: {
    command: 'python3 -m http.server 8081 --directory src/web',
    port: 8081,
    reuseExistingServer: !process.env.CI,
    timeout: 10_000,
  },
});
