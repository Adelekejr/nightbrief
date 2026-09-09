import { defineConfig, devices } from '@playwright/test'

/**
 * Browser checks.
 *
 * Every defect a reader has had to report on this project was invisible to
 * the type checker and to the unit tests: a control with no affordance, a
 * disabled state that made a control dead, a colour pair that only fails
 * visually, state that only diverges after navigation. None of those are
 * catchable without a real browser, so there is one here.
 *
 * The API is stubbed per test. These check the interface's behaviour, not the
 * pipeline's — the pipeline is covered by the unit tests and by probing the
 * deployed functions.
 */
export default defineConfig({
  testDir: './e2e',
  fullyParallel: true,
  reporter: [['list']],
  use: {
    baseURL: 'http://127.0.0.1:4173',
    launchOptions: { executablePath: '/opt/pw-browsers/chromium' },
  },
  projects: [
    { name: 'phone', use: { ...devices['Pixel 7'] } },
    { name: 'desktop', use: { ...devices['Desktop Chrome'], viewport: { width: 1280, height: 900 } } },
  ],
  webServer: {
    command: 'npm run preview -- --port 4173 --strictPort',
    url: 'http://127.0.0.1:4173',
    reuseExistingServer: true,
    timeout: 60_000,
  },
})
