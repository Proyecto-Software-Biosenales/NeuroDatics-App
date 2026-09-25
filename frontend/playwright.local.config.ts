import { defineConfig, devices } from "@playwright/test"

// Drives the student edition's real, running package (started by student/run-frozen.ps1 or by
// hand). It never starts a server: STUDENT_BASE_URL is the address the launcher printed.
export default defineConfig({
  testDir: "./tests/local",
  fullyParallel: false,
  workers: 1,
  retries: 0,
  timeout: 15 * 60_000,
  expect: { timeout: 15_000 },
  reporter: "list",
  outputDir: ".next/playwright-local",
  use: {
    baseURL: process.env.STUDENT_BASE_URL,
    viewport: { width: 1400, height: 1000 },
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
    launchOptions: {
      // Every name except loopback fails to resolve: the browser itself is offline.
      args: ["--host-resolver-rules=MAP * ~NOTFOUND, EXCLUDE 127.0.0.1"],
    },
  },
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }],
})
