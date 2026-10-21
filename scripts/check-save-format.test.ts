import { execFileSync } from "node:child_process";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

import type * as Schema from "effect/Schema";
import { afterEach, describe, expect, it } from "vitest";

import {
  checkSaveFormat,
  fingerprintOf,
  REGISTRY,
} from "./check-save-format.ts";

const repositories: string[] = [];

const git = (dir: string, args: readonly string[]) =>
  execFileSync(
    "git",
    [
      "-c",
      "user.name=Rushline",
      "-c",
      "user.email=rushline@example.com",
      "-c",
      "commit.gpgsign=false",
      ...args,
    ],
    { cwd: dir, stdio: "ignore" }
  );

const repository = (): string => {
  const dir = mkdtempSync(path.join(tmpdir(), "rushline-save-format-"));
  repositories.push(dir);
  git(dir, ["init", "--quiet"]);
  mkdirSync(path.join(dir, path.dirname(REGISTRY)), { recursive: true });
  return dir;
};

const register = (
  dir: string,
  versions: readonly (readonly [number, string])[]
) => {
  writeFileSync(
    path.join(dir, REGISTRY),
    JSON.stringify({
      versions: versions.map(([version, contract]) => ({
        fingerprint: fingerprintOf(contract),
        version,
      })),
    })
  );
};

const commit = (dir: string, file = REGISTRY) => {
  git(dir, ["add", "--", file]);
  git(dir, ["commit", "--quiet", "-m", "registry"]);
};

const check = (dir: string, version: number, contract: string) =>
  checkSaveFormat({ cwd: dir, fingerprint: fingerprintOf(contract), version });

const contract = (schema: Schema.JsonObject): string =>
  JSON.stringify({ definitions: {}, dialect: "draft-2020-12", schema });

const cash = { maximum: 1e9, minimum: -1e9, type: "integer" };
const version = { enum: [2], type: "number" };

const original = contract({
  additionalProperties: false,
  properties: { cash, version },
  required: ["cash", "version"],
  type: "object",
});
const reordered =
  '{"schema":{"type":"object","required":["version","cash"],"properties":{"version":{"type":"number","enum":[2]},"cash":{"type":"integer","minimum":-1000000000,"maximum":1000000000}},"additionalProperties":false,"description":"The same save, declared in another order."},"definitions":{}}';
const withSeed = contract({
  additionalProperties: false,
  properties: { cash, seed: { type: "number" }, version },
  required: ["cash", "seed", "version"],
  type: "object",
});

describe("check:save-format", () => {
  afterEach(() => {
    for (const dir of repositories.splice(0)) {
      rmSync(dir, { force: true, recursive: true });
    }
  });

  it("a declaration in another order, or a description, keeps the fingerprint and a new field changes it", () => {
    expect([
      fingerprintOf(reordered) === fingerprintOf(original),
      fingerprintOf(withSeed) === fingerprintOf(original),
    ]).toStrictEqual([true, false]);
  });

  it("a changed save shape fails at its version, also after its fingerprint is rewritten and committed, until it takes a new version", () => {
    const dir = repository();
    register(dir, [[2, original]]);
    commit(dir);
    const unchanged = check(dir, 2, original);
    const changed = check(dir, 2, withSeed);
    register(dir, [[2, withSeed]]);
    const rewritten = check(dir, 2, withSeed);
    commit(dir);
    const committed = check(dir, 2, withSeed);
    register(dir, [
      [2, original],
      [3, withSeed],
    ]);
    const bumped = check(dir, 3, withSeed);
    expect({ bumped, changed, committed, rewritten, unchanged }).toStrictEqual({
      bumped: [],
      changed: [
        expect.stringMatching(
          /no longer matches the fingerprint of version 2\. A changed save shape needs a new SAVE_VERSION/u
        ),
      ],
      committed: [
        expect.stringContaining(
          "changes the fingerprint of version 2, which was committed as"
        ),
      ],
      rewritten: [
        expect.stringContaining(
          "changes the fingerprint of version 2, which was committed as"
        ),
      ],
      unchanged: [],
    });
  });

  it("a committed version cannot be removed and SAVE_VERSION must be the newest", () => {
    const dir = repository();
    register(dir, [
      [2, original],
      [3, withSeed],
    ]);
    commit(dir);
    register(dir, [[3, withSeed]]);
    const removed = check(dir, 3, withSeed);
    register(dir, [
      [2, original],
      [3, withSeed],
    ]);
    expect([removed, check(dir, 2, original)]).toStrictEqual([
      [expect.stringContaining("no longer lists version 2")],
      [
        expect.stringContaining(
          "SAVE_VERSION is 2, but the highest version in packages/career/save-format.json is 3"
        ),
      ],
    ]);
  });

  it("a registry with no committed history, or a shallow clone, fails instead of passing", () => {
    const uncommitted = repository();
    writeFileSync(path.join(uncommitted, "README.md"), "Rushline\n");
    commit(uncommitted, "README.md");
    register(uncommitted, [[2, original]]);
    const full = repository();
    register(full, [[2, original]]);
    commit(full);
    register(full, [
      [2, original],
      [3, withSeed],
    ]);
    commit(full);
    const shallow = mkdtempSync(path.join(tmpdir(), "rushline-save-shallow-"));
    repositories.push(shallow);
    git(shallow, ["clone", "--quiet", "--depth", "1", `file://${full}`, "."]);
    expect([
      check(uncommitted, 2, original),
      check(shallow, 3, withSeed),
    ]).toStrictEqual([
      [expect.stringContaining("has no committed version")],
      [expect.stringContaining("This clone is shallow")],
    ]);
  });
});
