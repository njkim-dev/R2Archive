import { defineConfig } from '@playwright/test'

const baseURL = process.env.E2E_BASE_URL || 'http://127.0.0.1:5181'

export default defineConfig({
  testDir: './tests/e2e',
  forbidOnly: !!process.env.CI,
  workers: 1,
  use: {
    baseURL,
    channel: process.env.PLAYWRIGHT_CHANNEL || undefined,
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
  },
  projects: [1920, 1440, 1024, 768].map(width => ({
    name: `chromium-${width}`,
    use: { browserName: 'chromium', viewport: { width, height: 900 } },
  })),
  webServer: process.env.E2E_BASE_URL ? undefined : {
    command: 'npm run dev -- --host 127.0.0.1 --port 5181 --strictPort',
    url: baseURL,
  },
})
