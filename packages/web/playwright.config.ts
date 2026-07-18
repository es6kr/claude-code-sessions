import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { defineConfig, devices } from '@playwright/test'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const fixturesDir = path.resolve(__dirname, '../test-fixtures/sessions')

// Overridable so e2e can run beside an unrelated dev server already holding
// the default port (reuseExistingServer would otherwise attach to it and read
// the wrong CLAUDE_SESSIONS_DIR).
const port = process.env.PLAYWRIGHT_PORT ?? '5173'

export default defineConfig({
  testDir: './e2e',
  testIgnore: ['**/local/**'],
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  workers: process.env.CI ? 1 : undefined,
  reporter: 'html',
  use: {
    baseURL: `http://localhost:${port}`,
    trace: 'on-first-retry',
    screenshot: 'only-on-failure',
  },
  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
    },
  ],
  webServer: {
    command: `pnpm dev --port ${port}`,
    env: {
      CLAUDE_SESSIONS_DIR: fixturesDir,
    },
    url: `http://localhost:${port}`,
    reuseExistingServer: !process.env.CI,
    timeout: 30000,
  },
})
