import { existsSync, readdirSync, readFileSync } from "node:fs";
import path from "node:path";

import * as Schema from "effect/Schema";
import { describe, expect, it } from "vitest";

import config, {
  careerCodecFiles,
  deterministicFiles,
  hotBodies,
} from "../oxlint.config.ts";

const corePackages = ["packages/career", "packages/sim", "packages/track"];

const testFixtures = new Set([
  "packages/career/src/career-fixtures.ts",
  "packages/career/src/police-fixtures.ts",
  "packages/career/src/police-worker.ts",
  "packages/sim/src/race-fixtures.ts",
]);

const decodeManifest = Schema.decodeUnknownSync(
  Schema.fromJsonString(
    Schema.Struct({ exports: Schema.Record(Schema.String, Schema.String) })
  )
);

const sourcesUnder = (dir: string): string[] =>
  readdirSync(dir, { recursive: true, withFileTypes: true })
    .filter((entry) => entry.isFile() && entry.name.endsWith(".ts"))
    .map((entry) => path.relative(".", path.join(entry.parentPath, entry.name)))
    .map((file) => file.split(path.sep).join("/"))
    .toSorted();

const settingsFor = (file: string): Map<string, unknown> => {
  const settings = new Map<string, unknown>();
  for (const override of config.overrides ?? []) {
    if (override.files.some((glob) => path.matchesGlob(file, glob))) {
      for (const [rule, setting] of Object.entries(override.rules ?? {})) {
        settings.set(rule, setting);
      }
    }
  }
  return settings;
};

const rolesOf = (file: string): string[] => [
  ...(deterministicFiles.includes(file) ? ["deterministic"] : []),
  ...(careerCodecFiles.includes(file) ? ["save codec"] : []),
  ...(file.endsWith(".test.ts") || testFixtures.has(file) ? ["test"] : []),
];

const files = corePackages.flatMap((dir) => sourcesUnder(`${dir}/src`));

describe("deterministic scopes", () => {
  it("give every sim, track and career module exactly one role", () => {
    expect(
      files
        .map((file) => ({ file, roles: rolesOf(file) }))
        .filter(({ roles }) => roles.length !== 1)
    ).toStrictEqual([]);
  });

  it("list only modules that exist", () => {
    expect(
      [
        ...deterministicFiles,
        ...careerCodecFiles,
        ...testFixtures,
        ...Object.keys(hotBodies),
      ].filter((file) => !existsSync(file))
    ).toStrictEqual([]);
  });

  it("put deterministic-core on every deterministic module, with the same list as its graph", () => {
    expect(
      files
        .filter((file) => !file.endsWith(".test.ts"))
        .filter((file) => settingsFor(file).has("rushline/deterministic-core"))
    ).toStrictEqual(deterministicFiles.toSorted());
    expect(
      new Set(
        deterministicFiles.map((file) =>
          JSON.stringify(settingsFor(file).get("rushline/deterministic-core"))
        )
      )
    ).toStrictEqual(
      new Set([JSON.stringify(["error", { core: deterministicFiles }])])
    );
  });

  it("keep every owned math module in the deterministic core", () => {
    const owned = files.filter(
      (file) =>
        file.startsWith("packages/track/src/math") && !file.endsWith(".test.ts")
    );
    expect(owned).toContain("packages/track/src/math.ts");
    expect(
      owned.filter((file) => !deterministicFiles.includes(file))
    ).toStrictEqual([]);
  });

  it("give the save codecs the Effect library rules and the career rules none", () => {
    const effectRule = "rushline/no-effect-runtime";
    expect(
      careerCodecFiles.filter(
        (file) => settingsFor(file).get(effectRule) !== "error"
      )
    ).toStrictEqual([]);
    expect(
      deterministicFiles.filter((file) => settingsFor(file).has(effectRule))
    ).toStrictEqual([]);
  });

  it("put no-hot-allocation on each hot file with its bodies", () => {
    const hotFiles = Object.keys(hotBodies);
    expect(
      hotFiles.map((file) =>
        settingsFor(file).get("rushline/no-hot-allocation")
      )
    ).toStrictEqual(hotFiles.map(() => ["error", { bodies: hotBodies }]));
    expect(
      Object.entries(hotBodies).filter(([, bodies]) => bodies.length === 0)
    ).toStrictEqual([]);
  });

  it("resolve every core package's modules through its ./* export", () => {
    expect(
      corePackages.map(
        (dir) =>
          decodeManifest(readFileSync(`${dir}/package.json`, "utf-8")).exports
      )
    ).toStrictEqual(corePackages.map(() => ({ "./*": "./src/*.ts" })));
  });
});
