import { defineConfig } from "@playwright/test";

export default defineConfig({
  testDir: "./e2e",
  timeout: 60_000,
  retries: process.env.CI ? 2 : 0,
  use: {
    browserName: "chromium",
    baseURL: process.env.API_URL || "http://localhost:8000",
    actionTimeout: 10_000,
    screenshot: "only-on-failure",
  },
});
