import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import path from "node:path";
import process from "node:process";

import { EncodedSaveSchema } from "@racer/career/save-schema";
import {
  Bike,
  Level,
  Officer,
  Racer,
  Rival,
  Road,
  Weapon,
} from "@racer/career/save-values";
import { SAVE_VERSION } from "@racer/career/state";
import * as Result from "effect/Result";
import * as Schema from "effect/Schema";

import {
  domains,
  legacyFingerprintOf,
  listed,
  membersOf,
  refused,
  wireFingerprintOf,
} from "./save-wire.ts";
import type { Catalogues, Read } from "./save-wire.ts";

export const REGISTRY = "packages/career/save-format.json";

const Hash = Schema.String.check(Schema.isPattern(/^[0-9a-f]{64}$/u));
const Members = Schema.Array(Schema.Union([Schema.String, Schema.Finite]));

const RegistryFile = Schema.Struct({
  versions: Schema.Array(
    Schema.Struct({
      catalogues: Schema.optionalKey(
        Schema.Struct({
          Bike: Members,
          Level: Members,
          Officer: Members,
          Racer: Members,
          Rival: Members,
          Road: Members,
          Weapon: Members,
        })
      ),
      fingerprint: Hash,
      version: Schema.Int.check(Schema.isGreaterThan(0)),
      wireFingerprint: Schema.optionalKey(Hash),
    })
  ).check(Schema.isMinLength(1)),
});
type Registry = typeof RegistryFile.Type;
type Entry = Registry["versions"][number];
type Domain = (typeof domains)[number];

const decodeRegistry = Schema.decodeUnknownResult(
  Schema.fromJsonString(RegistryFile)
);

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

interface Anchors {
  readonly legacy: ReadonlyMap<number, string>;
  readonly members: ReadonlyMap<
    number,
    ReadonlyMap<Domain, ReadonlySet<string>>
  >;
  readonly wire: ReadonlyMap<number, string>;
}

const anchorsOf = (history: readonly Registry[]): Anchors => {
  const legacyAnchors = new Map<number, string>();
  const wire = new Map<number, string>();
  const members = new Map<number, Map<Domain, Set<string>>>();
  for (const entry of history.flatMap(({ versions }) => versions)) {
    if (!legacyAnchors.has(entry.version)) {
      legacyAnchors.set(entry.version, entry.fingerprint);
    }
    if (entry.wireFingerprint !== undefined && !wire.has(entry.version)) {
      wire.set(entry.version, entry.wireFingerprint);
    }
    const { catalogues } = entry;
    if (catalogues !== undefined) {
      const held = members.get(entry.version) ?? new Map<Domain, Set<string>>();
      for (const domain of domains) {
        held.set(
          domain,
          new Set([
            ...(held.get(domain) ?? []),
            ...membersOf(catalogues, domain),
          ])
        );
      }
      members.set(entry.version, held);
    }
  }
  return { legacy: legacyAnchors, members, wire };
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
            `${REGISTRY} is malformed. It holds { "versions": [{ "catalogues": { "Bike": [...], ... }, "fingerprint": <64 hex digits>, "version": <whole number above 0>, "wireFingerprint": <64 hex digits> }, ...] }.`
          ),
        onSuccess: (value): Read<Registry> => ({ ok: true, value }),
      }
    );
  } catch {
    return refused(`${REGISTRY} is missing. Restore it from Git.`);
  }
};

const historyProblems = (
  entries: ReadonlyMap<number, Entry>,
  anchors: Anchors
): readonly string[] => [
  ...[...anchors.legacy].flatMap(([version, anchor]) => {
    const held = entries.get(version);
    if (held === undefined) {
      return [
        `${REGISTRY} no longer lists version ${version}. Committed versions stay in the registry; restore it with fingerprint ${anchor}.`,
      ];
    }
    return held.fingerprint === anchor
      ? []
      : [
          `${REGISTRY} changes the fingerprint of version ${version}, which was committed as ${anchor}. A committed fingerprint never changes: restore it.`,
        ];
  }),
  ...[...anchors.wire].flatMap(([version, anchor]) => {
    const held = entries.get(version);
    if (held === undefined || held.wireFingerprint === anchor) {
      return [];
    }
    return [
      `${REGISTRY} ${held.wireFingerprint === undefined ? "drops" : "changes"} the wireFingerprint of version ${version}, which was committed as ${anchor}. A committed wireFingerprint never changes, also when Effect or the adapter changes: restore it, and give a changed save structure a new SAVE_VERSION.`,
    ];
  }),
  ...[...anchors.members].flatMap(([version, committed]) => {
    const catalogues = entries.get(version)?.catalogues;
    if (catalogues === undefined) {
      return [];
    }
    return domains.flatMap((domain) => {
      const kept = membersOf(catalogues, domain);
      const lost = [...(committed.get(domain) ?? [])].filter(
        (member) => !kept.includes(member)
      );
      return lost.length === 0
        ? []
        : [
            `${REGISTRY} no longer lists ${listed(lost)} in the ${domain} catalogue of version ${version}, which a committed registry listed. A version ${version} save may hold them, so they stay in the schema and in the registry; only a new SAVE_VERSION, agreed with the owner, can drop a catalogue ID.`,
          ];
    });
  }),
];

const versionProblems = (
  version: number,
  entries: ReadonlyMap<number, Entry>,
  anchors: Anchors
): readonly string[] => {
  const highest = Math.max(...entries.keys());
  return [
    ...(version === highest
      ? []
      : [
          `SAVE_VERSION is ${version}, but the highest version in ${REGISTRY} is ${highest}. SAVE_VERSION is always the newest registered version.`,
        ]),
    ...(!entries.has(version) || anchors.wire.has(version)
      ? []
      : [
          `Version ${version} has no committed wireFingerprint in ${REGISTRY}. Commit its entry before the check can pass: the check never takes the current schema as its anchor.`,
        ]),
  ];
};

const liveProblems = (
  entry: Entry,
  options: { readonly catalogues: Catalogues; readonly document: string }
): readonly string[] => {
  const live = wireFingerprintOf(options.document, options.catalogues);
  const structure = (() => {
    if (!live.ok) {
      return [live.problem];
    }
    if (
      entry.wireFingerprint === undefined ||
      entry.wireFingerprint === live.value
    ) {
      return [];
    }
    return [
      `The save's structure no longer matches the wireFingerprint of version ${entry.version}. A changed save structure needs a new SAVE_VERSION, agreed with the owner, and a new entry in ${REGISTRY} with fingerprint ${legacyFingerprintOf(options.document)}, wireFingerprint ${live.value} and the schema's catalogues; keep the existing entries. A new catalogue ID does not change the structure.`,
    ];
  })();
  const { catalogues } = entry;
  if (catalogues === undefined) {
    return [
      ...structure,
      `Version ${entry.version} in ${REGISTRY} lists no catalogues. List the schema's IDs for ${listed([...domains])}.`,
    ];
  }
  return [
    ...structure,
    ...domains.flatMap((domain) => {
      const schema = membersOf(options.catalogues, domain);
      const registered = membersOf(catalogues, domain);
      const added = schema.filter((member) => !registered.includes(member));
      const absent = registered.filter((member) => !schema.includes(member));
      return [
        ...(added.length === 0
          ? []
          : [
              `The schema's ${domain} catalogue has ${listed(added)}, which version ${entry.version} in ${REGISTRY} does not list. Add them to its ${domain} list: a new catalogue ID keeps existing saves and needs no new SAVE_VERSION.`,
            ]),
        ...(absent.length === 0
          ? []
          : [
              `Version ${entry.version} in ${REGISTRY} lists ${listed(absent)} in the ${domain} catalogue, which the schema does not have. The registry lists exactly the schema's IDs, and an ID a committed registry listed stays in both.`,
            ]),
      ];
    }),
  ];
};

export const checkSaveFormat = (options: {
  readonly catalogues: Catalogues;
  readonly cwd: string;
  readonly document: string;
  readonly version: number;
}): readonly string[] => {
  const history = historyOf(options.cwd);
  const registry = currentOf(options.cwd);
  if (!(history.ok && registry.ok)) {
    return [history, registry].flatMap((read) =>
      read.ok ? [] : [read.problem]
    );
  }
  const { versions } = registry.value;
  const entries = new Map(versions.map((entry) => [entry.version, entry]));
  const anchors = anchorsOf(history.value);
  const current = entries.get(options.version);
  return [
    ...(entries.size === versions.length
      ? []
      : [`${REGISTRY} lists a version more than once.`]),
    ...historyProblems(entries, anchors),
    ...versionProblems(options.version, entries, anchors),
    ...(current === undefined ? [] : liveProblems(current, options)),
  ];
};

if (import.meta.main) {
  const document = JSON.stringify(
    Schema.toJsonSchemaDocument(Schema.toEncoded(EncodedSaveSchema), {
      onExcessProperty: "error",
    })
  );
  const catalogues: Catalogues = {
    Bike: Bike.literals,
    Level: Level.literals,
    Officer: Officer.literals,
    Racer: Racer.literals,
    Rival: Rival.literals,
    Road: Road.literals,
    Weapon: Weapon.literals,
  };
  const problems = checkSaveFormat({
    catalogues,
    cwd: process.cwd(),
    document,
    version: SAVE_VERSION,
  });
  const live = wireFingerprintOf(document, catalogues);
  if (problems.length > 0 || !live.ok) {
    process.stderr.write(`${problems.join("\n")}\n`);
    process.exit(1);
  }
  process.stdout.write(
    `Save format: version ${SAVE_VERSION} matches wireFingerprint ${live.value}, with ${domains.map((domain) => `${membersOf(catalogues, domain).length} ${domain}`).join(", ")} IDs\n`
  );
}
