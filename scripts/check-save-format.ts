import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import path from "node:path";
import process from "node:process";

import { EncodedSaveSchema } from "@racer/career/save-schema";
import { SAVE_VERSION } from "@racer/career/state";
import * as Result from "effect/Result";
import * as Schema from "effect/Schema";

export const REGISTRY = "packages/career/save-format.json";

const RegistryFile = Schema.Struct({
  versions: Schema.Array(
    Schema.Struct({
      fingerprint: Schema.String.check(Schema.isPattern(/^[0-9a-f]{64}$/u)),
      version: Schema.Int.check(Schema.isGreaterThan(0)),
    })
  ).check(Schema.isMinLength(1)),
});
type Registry = typeof RegistryFile.Type;

type Read<Value> =
  | { readonly ok: true; readonly value: Value }
  | { readonly ok: false; readonly problem: string };

const refused = (problem: string): Read<never> => ({ ok: false, problem });

const decodeRegistry = Schema.decodeUnknownResult(
  Schema.fromJsonString(RegistryFile)
);
const decodeContract = Schema.decodeUnknownSync(
  Schema.fromJsonString(
    Schema.Struct({ definitions: Schema.JsonObject, schema: Schema.JsonObject })
  )
);

const documentation = new Set([
  "$comment",
  "default",
  "description",
  "examples",
  "title",
]);
const unordered = new Set(["anyOf", "enum", "oneOf", "required", "type"]);
const definitionPrefix = "#/$defs/";

const isList = (value: Schema.Json): value is Schema.JsonArray =>
  Array.isArray(value);

const isObject = (value: Schema.Json): value is Schema.JsonObject =>
  value !== null && !isList(value) && Object(value) === value;

const canonical = (
  value: Schema.Json,
  definitions: Schema.JsonObject,
  seen: readonly string[]
): Schema.Json => {
  if (isList(value)) {
    return value.map((item) => canonical(item, definitions, seen));
  }
  if (!isObject(value)) {
    return value;
  }
  const { $ref: reference, ...rest } = value;
  if (reference !== undefined) {
    const target = Object.entries(definitions).find(
      ([name]) => reference === `${definitionPrefix}${name}`
    );
    if (
      target === undefined ||
      seen.includes(target[0]) ||
      Object.keys(rest).some((key) => !documentation.has(key))
    ) {
      throw new Error(`Unsupported reference ${JSON.stringify(reference)}.`);
    }
    return canonical(target[1], definitions, [...seen, target[0]]);
  }
  const keys = Object.keys(rest)
    .filter((key) => !documentation.has(key))
    .toSorted();
  if (keys.length === 0) {
    throw new Error("An unconstrained schema has no wire description.");
  }
  return Object.fromEntries(
    keys.map((key) => {
      const inner = canonical(rest[key] ?? null, definitions, seen);
      return [
        key,
        unordered.has(key) && isList(inner)
          ? inner.toSorted((left, right) =>
              JSON.stringify(left).localeCompare(JSON.stringify(right))
            )
          : inner,
      ];
    })
  );
};

export const fingerprintOf = (contract: string): string => {
  const { definitions, schema } = decodeContract(contract);
  return createHash("sha256")
    .update(JSON.stringify(canonical(schema, definitions, [])))
    .digest("hex");
};

const git = (cwd: string, args: readonly string[]): string =>
  execFileSync("git", args, {
    cwd,
    encoding: "utf-8",
    stdio: ["ignore", "pipe", "ignore"],
  }).trim();

const committedRegistries = (cwd: string): readonly Registry[] =>
  git(cwd, ["rev-list", "--topo-order", "--reverse", "HEAD", "--", REGISTRY])
    .split("\n")
    .filter((commit) => commit !== "")
    .flatMap((commit) => {
      try {
        return Result.match(
          decodeRegistry(git(cwd, ["show", `${commit}:${REGISTRY}`])),
          { onFailure: () => [], onSuccess: (registry) => [registry] }
        );
      } catch {
        return [];
      }
    });

const anchorsOf = (history: readonly Registry[]) => {
  const anchors = new Map<number, string>();
  for (const { versions } of history) {
    for (const entry of versions) {
      if (!anchors.has(entry.version)) {
        anchors.set(entry.version, entry.fingerprint);
      }
    }
  }
  return anchors;
};

const historyOf = (cwd: string): Read<readonly Registry[]> => {
  try {
    if (git(cwd, ["rev-parse", "--is-shallow-repository"]) === "true") {
      return refused(
        `This clone is shallow, so the history of ${REGISTRY} is incomplete. Fetch the full history; CI checks out with fetch-depth: 0.`
      );
    }
    const history = committedRegistries(cwd);
    return history.length > 0
      ? { ok: true, value: history }
      : refused(
          `${REGISTRY} has no committed version. Commit the registry before its fingerprints can be checked.`
        );
  } catch {
    return refused(
      `The history of ${REGISTRY} could not be read from Git. Run the check inside the repository with its full history.`
    );
  }
};

const currentOf = (cwd: string): Read<Registry> => {
  try {
    return Result.match(
      decodeRegistry(readFileSync(path.join(cwd, REGISTRY), "utf-8")),
      {
        onFailure: () =>
          refused(
            `${REGISTRY} is malformed. It holds { "versions": [{ "fingerprint": <64 hex digits>, "version": <whole number above 0> }, ...] }.`
          ),
        onSuccess: (value): Read<Registry> => ({ ok: true, value }),
      }
    );
  } catch {
    return refused(`${REGISTRY} is missing. Restore it from Git.`);
  }
};

export const checkSaveFormat = (options: {
  readonly cwd: string;
  readonly fingerprint: string;
  readonly version: number;
}): readonly string[] => {
  const history = historyOf(options.cwd);
  const registry = currentOf(options.cwd);
  if (!(history.ok && registry.ok)) {
    return [history, registry].flatMap((read) =>
      read.ok ? [] : [read.problem]
    );
  }
  const current = registry.value;
  const problems: string[] = [];
  const entries = new Map(
    current.versions.map((entry) => [entry.version, entry.fingerprint])
  );
  if (entries.size !== current.versions.length) {
    problems.push(`${REGISTRY} lists a version more than once.`);
  }
  for (const [version, anchor] of anchorsOf(history.value)) {
    const held = entries.get(version);
    if (held === undefined) {
      problems.push(
        `${REGISTRY} no longer lists version ${version}. Committed versions stay in the registry; restore it with fingerprint ${anchor}.`
      );
    } else if (held !== anchor) {
      problems.push(
        `${REGISTRY} changes the fingerprint of version ${version}, which was committed as ${anchor}. A committed fingerprint never changes: restore it, and give a new save shape a new SAVE_VERSION.`
      );
    }
  }
  const highest = Math.max(...entries.keys());
  if (options.version !== highest) {
    problems.push(
      `SAVE_VERSION is ${options.version}, but the highest version in ${REGISTRY} is ${highest}. SAVE_VERSION is always the newest registered version.`
    );
  }
  if (entries.get(options.version) !== options.fingerprint) {
    problems.push(
      `The encoded save shape no longer matches the fingerprint of version ${options.version}. A changed save shape needs a new SAVE_VERSION, agreed with the owner, and a new entry with fingerprint ${options.fingerprint} in ${REGISTRY}; keep the existing entries.`
    );
  }
  return problems;
};

if (import.meta.main) {
  const contract = JSON.stringify(
    Schema.toJsonSchemaDocument(Schema.toEncoded(EncodedSaveSchema), {
      onExcessProperty: "error",
    })
  );
  const fingerprint = fingerprintOf(contract);
  const problems = checkSaveFormat({
    cwd: process.cwd(),
    fingerprint,
    version: SAVE_VERSION,
  });
  if (problems.length > 0) {
    process.stderr.write(`${problems.join("\n")}\n`);
    process.exit(1);
  }
  process.stdout.write(
    `Save format: version ${SAVE_VERSION} matches ${fingerprint}\n`
  );
}
