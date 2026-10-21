import path from "node:path";

import { describe, expect, it } from "vitest";

import config from "../oxlint.config.ts";

const entryRules = [
  "rushline/no-floating-effect",
  "rushline/no-inline-schema-compile",
  "rushline/no-manual-effect-error-tag",
  "rushline/no-manual-tag-comparison",
  "rushline/no-manual-tagged-construction",
  "rushline/no-node-io",
  "rushline/no-promise",
  "rushline/no-swallowed-failure",
  "rushline/prefer-catch-tags",
  "rushline/prefer-effect-fn",
  "rushline/prefer-effect-match",
  "rushline/require-wrapped-cause",
];

const libraryRules = [
  ...entryRules,
  "rushline/no-effect-runtime",
  "rushline/no-service-constructor-imports",
].toSorted();

const boundaryRules = new Set(libraryRules);

const boundaryRulesFor = (file: string): string[] => {
  const settings = new Map<string, unknown>();
  for (const override of config.overrides ?? []) {
    if (override.files.some((glob) => path.matchesGlob(file, glob))) {
      for (const [rule, setting] of Object.entries(override.rules ?? {})) {
        settings.set(rule, setting);
      }
    }
  }
  return [...settings]
    .filter(([rule, setting]) => boundaryRules.has(rule) && setting === "error")
    .map(([rule]) => rule)
    .toSorted();
};

describe("Effect boundary scopes", () => {
  it.each([
    "apps/web/src/routes/api/telemetry.ts",
    "apps/web/src/diagnostics/uploader-runtime.ts",
    "tools/verify/rushline.ts",
  ])("give the entry %s every rule but the library ones", (file) => {
    expect(boundaryRulesFor(file)).toStrictEqual(entryRules);
  });

  it.each([
    "apps/web/src/server/telemetry.ts",
    "apps/web/src/server/telemetry-local.ts",
    "apps/web/src/server/refusals/store-failed.ts",
    "apps/web/src/server/later/handler.ts",
    "packages/telemetry/src/jsonl-store.ts",
    "packages/telemetry/src/memory-store.ts",
    "packages/telemetry/src/later.ts",
    "apps/web/src/diagnostics/uploader.ts",
    "apps/web/src/diagnostics/upload/delivery.ts",
    "apps/web/src/diagnostics/upload/worker.ts",
    "apps/web/src/diagnostics/upload/later.ts",
    "tools/verify/src/state.ts",
  ])("give the library %s all fourteen rules", (file) => {
    expect(boundaryRulesFor(file)).toStrictEqual(libraryRules);
  });

  it.each([
    "apps/web/test/telemetry.test.ts",
    "apps/web/test/uploader.test.ts",
    "packages/telemetry/test/store.test.ts",
    "apps/web/src/diagnostics/hub.ts",
    "apps/web/src/diagnostics/recorder.ts",
    "apps/web/src/components/use-flow.ts",
    "apps/web/src/routes/index.tsx",
    "apps/web/vite.config.ts",
    "packages/sim/src/race.ts",
  ])("leave %s outside the boundary rules", (file) => {
    expect(boundaryRulesFor(file)).toStrictEqual([]);
  });

  it("never sets a rule below error in an override", () => {
    const settings = (config.overrides ?? []).flatMap((override) =>
      Object.values(override.rules ?? {})
    );
    expect(settings.filter((setting) => setting !== "error")).toStrictEqual([]);
  });
});
