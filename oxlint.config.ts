import { defineConfig } from "oxlint";
import core from "ultracite/oxlint/core";
import vitest from "ultracite/oxlint/vitest";

const effectFiles = [
  "tools/perf/*.ts",
  "tools/perf/src/**/*.ts",
  "tools/verify/*.ts",
  "tools/verify/src/**/*.ts",
  "packages/devtools/src/**/*.ts",
  "apps/web/src/server/**/*.ts",
  "apps/web/src/routes/api/telemetry.ts",
  "packages/telemetry/src/**/*.ts",
  "apps/web/src/diagnostics/uploader.ts",
  "apps/web/src/diagnostics/uploader-runtime.ts",
  "apps/web/src/diagnostics/upload/**/*.ts",
];

const orchestrationFiles = [
  "tools/perf/*.ts",
  "tools/perf/src/**/*.ts",
  "tools/verify/*.ts",
  "tools/verify/src/**/*.ts",
  "packages/devtools/src/*.ts",
  "apps/web/src/server/**/*.ts",
  "apps/web/src/routes/api/telemetry.ts",
  "packages/telemetry/src/**/*.ts",
  "apps/web/src/diagnostics/uploader.ts",
  "apps/web/src/diagnostics/uploader-runtime.ts",
  "apps/web/src/diagnostics/upload/**/*.ts",
];

const libraryFiles = [
  "tools/perf/src/**/*.ts",
  "tools/verify/src/**/*.ts",
  "packages/devtools/src/**/*.ts",
  "apps/web/src/server/**/*.ts",
  "packages/telemetry/src/**/*.ts",
  "apps/web/src/diagnostics/uploader.ts",
  "apps/web/src/diagnostics/upload/**/*.ts",
];

export default defineConfig({
  extends: [core, vitest],
  ignorePatterns: [
    ...(core.ignorePatterns ?? []),
    "**/dist/**",
    "**/routeTree.gen.ts",
    "tools/oxlint/anti-slop/**",
  ],
  jsPlugins: [
    { name: "anti-slop", specifier: "./tools/oxlint/anti-slop/index.ts" },
    { name: "rushline", specifier: "./tools/oxlint/rushline/index.ts" },
  ],
  options: { typeAware: true },
  overrides: [
    {
      files: [
        "**/*.{test,spec,test-d,spec-d}.{ts,tsx,js,jsx}",
        "**/__tests__/**/*.{ts,tsx,js,jsx}",
      ],
      rules: {
        "no-empty-function": "error",
        "promise/prefer-await-to-then": "error",
      },
    },
    {
      files: effectFiles,
      rules: {
        "rushline/no-floating-effect": "error",
        "rushline/no-inline-schema-compile": "error",
        "rushline/no-manual-effect-error-tag": "error",
        "rushline/no-manual-tag-comparison": "error",
        "rushline/no-manual-tagged-construction": "error",
        "rushline/no-promise": "error",
        "rushline/no-swallowed-failure": "error",
        "rushline/prefer-catch-tags": "error",
        "rushline/prefer-effect-fn": "error",
        "rushline/prefer-effect-match": "error",
        "rushline/require-wrapped-cause": "error",
      },
    },
    {
      files: orchestrationFiles,
      rules: { "rushline/no-node-io": "error" },
    },
    {
      files: libraryFiles,
      rules: {
        "rushline/no-effect-runtime": "error",
        "rushline/no-service-constructor-imports": "error",
      },
    },
  ],
  rules: {
    "anti-slop/no-chained-type-assertions": "error",
    "anti-slop/no-conditional-empty-object-spread": "error",
    "anti-slop/no-known-value-widening": "error",
    "anti-slop/no-module-mocking": "error",
    "anti-slop/no-object-parameters": "error",
    "anti-slop/no-reflect-apply": "error",
    "anti-slop/no-reflect-get": "error",
    "anti-slop/no-runtime-typeof": "error",
    "anti-slop/no-shape-in-symbol-names": "error",
    "anti-slop/no-unknown-parameters": "error",
    "anti-slop/no-unknown-returns": "error",
    "anti-slop/no-unknown-type-aliases": "error",
    "anti-slop/no-unsafe-dictionary-type": "error",
    "anti-slop/no-widen-then-assert": "error",
    "anti-slop/require-safety-comment-for-type-assertion": "error",
    "no-restricted-imports": [
      "error",
      {
        paths: [
          {
            message:
              "Import Effect by module path, such as effect/Effect or effect/Schema.",
            name: "effect",
          },
        ],
      },
    ],
    "rushline/no-comments": "error",
    "rushline/require-suppression-reason": "error",
    "rushline/safety-verified-by": "error",
    "rushline/workspace-imports": "error",
    "typescript/no-floating-promises": "error",
  },
});
