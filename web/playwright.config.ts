import { defineConfig } from "@playwright/test";

export default defineConfig({
  testDir: "./tests",
  timeout: 30000,
  fullyParallel: false,
  workers: 1,
  reporter: [
    ["list"],
    ["json", { outputFile: "../docs/frontend/test-results.json" }],
  ],
  use: {
    baseURL: "http://127.0.0.1:4173/preview/band/",
    viewport: { width: 1440, height: 1000 },
    browserName: "chromium",
    headless: true,
    launchOptions: process.env.BAND_BROWSER_PATH
      ? { executablePath: process.env.BAND_BROWSER_PATH }
      : {},
  },
  webServer: {
    command: "node scripts/serve.mjs",
    port: 4173,
    reuseExistingServer: !process.env.CI,
    timeout: 15000,
  },
});
