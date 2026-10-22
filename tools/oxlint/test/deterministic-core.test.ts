import { spawnSync } from "node:child_process";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

import { afterAll, describe, expect, it } from "vitest";

import { deterministicCoreRule } from "../rushline/rules/deterministic-core.ts";
import { runRule } from "./cases.ts";

const core = [
  "packages/career/src/settle.ts",
  "packages/sim/src/pilot.ts",
  "packages/sim/src/race.ts",
  "packages/sim/src/state.ts",
  "packages/track/src/random.ts",
  "packages/track/src/track.ts",
  "packages/track/src/tracks/ridge-road.ts",
];
const options = [{ core }];
const inRace = { filename: "packages/sim/src/race.ts", options };
const inSettle = { filename: "packages/career/src/settle.ts", options };

const once = (messageId: string, data?: Readonly<Record<string, string>>) => [
  data === undefined ? { messageId } : { data, messageId },
];

const outward = (source: string) => ({
  code: `import { x } from "${source}";`,
  errors: once("outward", { source }),
  ...inRace,
});

const graph = mkdtempSync(path.join(tmpdir(), "rushline-core-"));
const writeFixture = (file: string, text: string) => {
  mkdirSync(path.dirname(path.join(graph, file)), { recursive: true });
  writeFileSync(path.join(graph, file), text);
};
writeFixture("package.json", '{ "name": "fixture-root" }');
writeFixture(
  "packages/sim/package.json",
  '{ "name": "@racer/sim", "exports": { "./*": "./src/*.ts" } }'
);
writeFixture(
  "packages/track/package.json",
  '{ "name": "@racer/track", "exports": { "./*": "./src/*.ts" } }'
);
writeFixture(
  "packages/sim/src/facade.ts",
  'export { lapTime } from "./helper.ts";\n'
);
writeFixture(
  "packages/sim/src/helper.ts",
  'import { unitOf } from "@racer/track/random";\nexport const lapTime = () => Date.now() + unitOf(1);\n'
);
writeFixture(
  "packages/track/src/random.ts",
  "export const unitOf = (seed: number) => seed / 2;\n"
);
const graphCore = [
  "packages/sim/src/facade.ts",
  "packages/sim/src/helper.ts",
  "packages/track/src/random.ts",
];
writeFixture(
  ".oxlintrc.json",
  JSON.stringify({
    jsPlugins: [
      {
        name: "rushline",
        specifier: path.join(import.meta.dirname, "../rushline/index.ts"),
      },
    ],
    overrides: [
      {
        files: graphCore,
        rules: {
          "rushline/deterministic-core": ["error", { core: graphCore }],
        },
      },
    ],
  })
);
const inGraph = (file: string) => ({
  cwd: graph,
  filename: path.join(graph, file),
  options: [{ core: graphCore }],
});

runRule("rushline/deterministic-core", deterministicCoreRule, {
  invalid: [
    {
      code: "export const now = () => Date.now();",
      errors: once("ambient", { name: "Date" }),
      ...inRace,
    },
    {
      code: "export const made = new Date(0);",
      errors: once("ambient", { name: "Date" }),
      ...inRace,
    },
    {
      code: "const Clock = Date;\nexport const later = Clock.now();",
      errors: once("ambient", { name: "Date" }),
      ...inRace,
    },
    {
      code: "export const t = performance.now();",
      errors: once("ambient", { name: "performance" }),
      ...inRace,
    },
    {
      code: "export const later = (run: (f: unknown) => void) => run(setTimeout);",
      errors: once("ambient", { name: "setTimeout" }),
      ...inRace,
    },
    {
      code: "export const roll = () => Math.random();",
      errors: once("mathRandom"),
      ...inRace,
    },
    {
      code: 'export const roll = () => Math["random"]();',
      errors: once("mathRandom"),
      ...inRace,
    },
    {
      code: "const random = Math.random;\nexport const roll = () => random();",
      errors: once("mathRandom"),
      ...inRace,
    },
    {
      code: "export const pick = (key: 'min') => Math[key](1, 2);",
      errors: once("mathEscape"),
      ...inRace,
    },
    {
      code: "const math = Math;\nexport const roll = () => math.random();",
      errors: once("mathEscape"),
      ...inRace,
    },
    {
      code: "const { random } = Math;\nexport const roll = () => random();",
      errors: once("mathEscape"),
      ...inRace,
    },
    {
      code: 'export const roll = () => globalThis["Math"]["random"]();',
      errors: once("ambient", { name: "globalThis" }),
      ...inRace,
    },
    {
      code: "const host = globalThis;\nexport const roll = () => host.Math.random();",
      errors: once("ambient", { name: "globalThis" }),
      ...inRace,
    },
    {
      code: "export const wide = () => window.innerWidth + document.title.length;",
      errors: [
        { data: { name: "window" }, messageId: "ambient" },
        { data: { name: "document" }, messageId: "ambient" },
      ],
      languageOptions: { env: { browser: true } },
      ...inRace,
    },
    {
      code: "export const host = () => [navigator, crypto.getRandomValues, fetch];",
      errors: [
        { data: { name: "navigator" }, messageId: "ambient" },
        { data: { name: "crypto" }, messageId: "ambient" },
        { data: { name: "fetch" }, messageId: "ambient" },
      ],
      ...inRace,
    },
    {
      code: "export const draw = (canvas: HTMLCanvasElement) => canvas;",
      errors: once("ambient", { name: "HTMLCanvasElement" }),
      ...inRace,
    },
    outward("node:crypto"),
    outward("fs"),
    outward("effect/Schema"),
    outward("three"),
    {
      code: 'import type { Scene } from "three";\nexport type View = Scene;',
      errors: once("outward", { source: "three" }),
      ...inRace,
    },
    {
      code: 'export * from "three";',
      errors: once("outward", { source: "three" }),
      ...inRace,
    },
    {
      code: 'export type Scene = import("three").Scene;',
      errors: once("outward", { source: "three" }),
      ...inRace,
    },
    {
      code: 'import { frameRates } from "@racer/telemetry/limits";',
      errors: once("outsideCore", {
        source: "@racer/telemetry/limits",
        target: "packages/telemetry/src/limits.ts",
      }),
      ...inRace,
    },
    {
      code: 'export const load = () => require("fs");',
      errors: once("ambient", { name: "require" }),
      ...inRace,
    },
    {
      code: 'export const load = () => import("./state.ts");',
      errors: once("dynamicImport"),
      ...inRace,
    },
    {
      code: "export const load = (name: string) => import(name);",
      errors: once("dynamicImport"),
      ...inRace,
    },
    {
      code: 'import fs = require("fs");\nexport const read = fs;',
      errors: once("importEquals"),
      ...inRace,
    },
    {
      code: "export const here = import.meta.url;",
      errors: once("importMeta"),
      ...inRace,
    },
    {
      code: 'import { field } from "./race-fixtures.ts";\nexport const f = field;',
      errors: once("outsideCore", {
        source: "./race-fixtures.ts",
        target: "packages/sim/src/race-fixtures.ts",
      }),
      ...inRace,
    },
    {
      code: 'import { gone } from "./gone.ts";\nexport const g = gone;',
      errors: once("unresolved", { source: "./gone.ts" }),
      ...inRace,
    },
    {
      code: 'import type { SaveText } from "./save-schema.ts";\nexport type S = SaveText;',
      errors: once("outsideCore", {
        source: "./save-schema.ts",
        target: "packages/career/src/save-schema.ts",
      }),
      ...inSettle,
    },
    {
      code: 'import { unitOf } from "@racer/track/random";\nexport const lapTime = () => Date.now() + unitOf(1);',
      errors: once("ambient", { name: "Date" }),
      ...inGraph("packages/sim/src/helper.ts"),
    },
  ],
  valid: [
    {
      code: 'import { nextSeed as next, unitOf } from "@racer/track/random";\nexport const roll = (seed: number) => unitOf(next(seed));',
      ...inRace,
    },
    {
      code: 'import { clamp } from "./state.ts";\nimport type { Track } from "@racer/track/track";\nimport { ridgeRoad } from "@racer/track/tracks/ridge-road";\nexport const f = (t: Track) => clamp(t.length, 0, ridgeRoad.sections.length);',
      ...inRace,
    },
    {
      code: 'export { pilotInput } from "./pilot.ts";\nexport type { RaceState } from "./state.ts";',
      ...inRace,
    },
    {
      code: 'export const f = (a: number) => Math.min(a, Math.imul(a, 3), Math["abs"](a));',
      ...inRace,
    },
    {
      code: "export const f = (Date: number, performance: number) => {\n  const Math = { random: () => 4 };\n  const o = { window: 1, document: 'clock' };\n  return Date + performance + Math.random() + o.window + 'Date.now()'.length;\n};",
      ...inRace,
    },
    {
      code: 'export { lapTime } from "./helper.ts";',
      ...inGraph("packages/sim/src/facade.ts"),
    },
  ],
});

describe("rushline/deterministic-core across a module graph", () => {
  afterAll(() => {
    rmSync(graph, { force: true, recursive: true });
  });

  it("fails the lint when a helper behind a clean facade reads the clock", () => {
    const linted = spawnSync(
      path.join(import.meta.dirname, "../node_modules/.bin/oxlint"),
      ["--format", "unix", "packages"],
      { cwd: graph, encoding: "utf-8" }
    );
    expect(linted.status).toBe(1);
    expect(linted.stdout).toContain("packages/sim/src/helper.ts");
    expect(linted.stdout).not.toContain("packages/sim/src/facade.ts");
  });
});
