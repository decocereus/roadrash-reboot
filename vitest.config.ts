import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    include: [
      "apps/**/*.test.{ts,tsx}",
      "packages/**/*.test.{ts,tsx}",
      "scripts/**/*.test.ts",
      "tools/{perf,verify}/test/**/*.test.ts",
    ],
    maxWorkers: 2,
  },
});
