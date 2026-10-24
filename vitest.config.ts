import { configDefaults, defineConfig } from "vitest/config";

const viteTests = [
  "apps/**/*.test.tsx",
  "packages/**/*.test.tsx",
  "apps/web/test/asset-load.test.ts",
  "apps/web/test/celebrity-load.test.ts",
  "apps/web/test/planted-hands.test.ts",
  "apps/web/test/renderer-lifecycle.test.ts",
];
const policeTest = "packages/career/src/police.test.ts";
const nativeImports = { nodeLoader: false, viteModuleRunner: false };

export default defineConfig({
  test: {
    projects: [
      {
        test: {
          exclude: [...configDefaults.exclude, ...viteTests, policeTest],
          experimental: nativeImports,
          include: [
            "apps/**/*.test.ts",
            "packages/**/*.test.ts",
            "scripts/**/*.test.ts",
            "tools/{perf,verify,madrid}/test/**/*.test.ts",
          ],
          name: "node",
        },
      },
      {
        test: {
          experimental: nativeImports,
          include: [policeTest],
          name: "police",
        },
      },
      {
        test: {
          include: viteTests,
          name: "vite",
          setupFiles: ["apps/web/test/node-images.ts"],
        },
      },
    ],
  },
});
