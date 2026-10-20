import { defineConfig, devices } from "@playwright/test"

// Only the screenshots of the user manual (`npm run capture:manual`). It lives apart from
// playwright.config.ts because it overwrites tracked files under manual/assets/screenshots.
const port = Number(process.env.PLAYWRIGHT_PORT ?? 3100)

export default defineConfig({
  testDir: "./tests/manual",
  fullyParallel: false,
  workers: 1,
  timeout: 120_000,
  expect: {
    timeout: 10_000,
  },
  reporter: "list",
  outputDir: ".next/playwright-manual",
  use: {
    baseURL: `http://127.0.0.1:${port}`,
    trace: "retain-on-failure",
  },
  projects: [
    {
      name: "chromium",
      use: { ...devices["Desktop Chrome"] },
    },
  ],
  webServer: {
    command: `npm run dev -- --hostname 127.0.0.1 --port ${port}`,
    url: `http://127.0.0.1:${port}`,
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
  },
})
