import { defineConfig, devices } from "@playwright/test";

export default defineConfig({
  testDir: "./e2e",
  fullyParallel: false,
  forbidOnly: !!process.env.CI,
  retries: 0,
  workers: 1,
  reporter: "list",

  use: {
    baseURL: "http://localhost:3100",
    trace: "on-first-retry",
    screenshot: "on",
    headless: true,
  },

  // Dedicated server on a fresh, seeded database; leaves the :3000 dev server
  // and data/ untouched.
  webServer: {
    command:
      "mkdir -p .tmp && rm -f .tmp/e2e.sqlite*" +
      " && export DATABASE_URL=.tmp/e2e.sqlite NODE_OPTIONS=--experimental-sqlite" +
      " && tsx e2e/seed.ts" +
      " && PORT=3100 NODE_ENV=development tsx server/_core/index.ts",
    port: 3100,
    reuseExistingServer: false,
  },

  projects: [
    {
      name: "chromium",
      use: { ...devices["Desktop Chrome"] },
    },
  ],
});
