import { configDefaults, defineConfig } from "vitest/config";

const viteTests = [
  "apps/**/*.test.tsx",
  "packages/**/*.test.tsx",
  "apps/web/test/asset-load.test.ts",
  "apps/web/test/renderer-lifecycle.test.ts",
];

export default defineConfig({
  test: {
    projects: [
      {
        test: {
          exclude: [...configDefaults.exclude, ...viteTests],
          experimental: { nodeLoader: false, viteModuleRunner: false },
          include: [
            "apps/**/*.test.ts",
            "packages/**/*.test.ts",
            "scripts/**/*.test.ts",
            "tools/{perf,verify}/test/**/*.test.ts",
          ],
          name: "node",
        },
      },
      { test: { include: viteTests, name: "vite" } },
    ],
  },
});
