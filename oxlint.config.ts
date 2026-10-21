import { defineConfig } from "oxlint";
import core from "ultracite/oxlint/core";
import vitest from "ultracite/oxlint/vitest";

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
      files: ["alchemy.run.ts"],
      rules: {
        "func-names": "off",
        "max-classes-per-file": "off",
      },
    },
    {
      files: ["apps/web/**/*.{ts,tsx}", "packages/ui/**/*.{ts,tsx}"],
      rules: {
        "func-style": "off",
        "no-await-in-loop": "off",
        "no-nested-ternary": "off",
        "no-shadow": "off",
        "no-use-before-define": "off",
        "promise/prefer-await-to-callbacks": "off",
        "promise/prefer-await-to-then": "off",
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
    "typescript/no-floating-promises": "error",
  },
});
