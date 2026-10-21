import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    include: ["tools/oxlint/test/**/*.test.ts", "scripts/**/*.test.ts"],
    setupFiles: ["tools/oxlint/test/setup.ts"],
  },
});
