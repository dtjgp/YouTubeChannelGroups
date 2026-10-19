const {defineConfig} = require("@playwright/test");
// Hosted macOS runners are virtual machines that are slower and noisier than a development Mac.
// There, waits get more time and a failed test is retried once; the GitHub reporter annotates flaky tests.
const ci = !!process.env.CI;
module.exports = defineConfig({
  testDir: "./tests/browser",
  workers: 1,
  timeout: ci ? 60000 : 30000,
  expect: {timeout: ci ? 10000 : 5000},
  retries: ci ? 1 : 0,
  reporter: ci ? [["list"], ["github"]] : "list"
});
