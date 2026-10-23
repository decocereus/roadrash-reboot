import { execFileSync } from "node:child_process";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

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
import * as Schema from "effect/Schema";
import { afterEach, describe, expect, it } from "vitest";

import { checkSaveFormat, REGISTRY } from "./check-save-format.ts";
import { legacyFingerprintOf, wireFingerprintOf } from "./save-wire.ts";
import type { Catalogues } from "./save-wire.ts";

type Node = Schema.JsonObject;
type Visit = (node: Node) => Node;
type Member = string | number;

interface Save {
  readonly catalogues: Catalogues;
  readonly document: Node;
}

interface Entry {
  readonly catalogues?: Catalogues;
  readonly fingerprint: string;
  readonly version: number;
  readonly wireFingerprint?: string;
}

const decodeNode = Schema.decodeUnknownSync(
  Schema.fromJsonString(Schema.JsonObject)
);

const isList = (value: Schema.Json): value is Schema.JsonArray =>
  Array.isArray(value);

const isNode = (value: Schema.Json): value is Node =>
  value !== null && !isList(value) && Object(value) === value;

const child = (node: Node, key: string): Node => {
  const value = node[key] ?? null;
  if (!isNode(value)) {
    throw new Error(`No schema at ${key}.`);
  }
  return value;
};

const listOf = (node: Node, key: string): readonly Schema.Json[] => {
  const value = node[key] ?? null;
  return isList(value) ? value : [];
};

const set = (node: Node, key: string, value: Schema.Json): Node =>
  Object.fromEntries(new Map(Object.entries(node)).set(key, value));

const drop = (node: Node, key: string): Node =>
  Object.fromEntries(Object.entries(node).filter(([name]) => name !== key));

const base: Save = {
  catalogues: {
    Bike: Bike.literals,
    Level: Level.literals,
    Officer: Officer.literals,
    Racer: Racer.literals,
    Rival: Rival.literals,
    Road: Road.literals,
    Weapon: Weapon.literals,
  },
  document: decodeNode(
    JSON.stringify(
      Schema.toJsonSchemaDocument(Schema.toEncoded(EncodedSaveSchema), {
        onExcessProperty: "error",
      })
    )
  ),
};

const rewrite = (value: Schema.Json, visit: Visit): Schema.Json => {
  if (isList(value)) {
    return value.map((item) => rewrite(item, visit));
  }
  if (!isNode(value)) {
    return value;
  }
  return visit(
    Object.fromEntries(
      Object.entries(value).map(([key, inner]) => [
        key,
        key === "properties" && isNode(inner)
          ? Object.fromEntries(
              Object.entries(inner).map(([name, field]) => [
                name,
                rewrite(field, visit),
              ])
            )
          : rewrite(inner, visit),
      ])
    )
  );
};

const edit = (
  save: Save,
  visit: Visit,
  catalogues: Partial<Catalogues> = {}
): Save => ({
  catalogues: { ...save.catalogues, ...catalogues },
  document: set(
    save.document,
    "schema",
    rewrite(child(save.document, "schema"), visit)
  ),
});

const top = (
  properties: (fields: Node) => Node,
  required: (names: readonly Schema.Json[]) => readonly Schema.Json[] = (
    names
  ) => names
): Save => {
  const schema = child(base.document, "schema");
  const fields = set(
    schema,
    "properties",
    properties(child(schema, "properties"))
  );
  return {
    catalogues: base.catalogues,
    document: set(
      base.document,
      "schema",
      set(fields, "required", required(listOf(schema, "required")))
    ),
  };
};

const canonical = (values: readonly Schema.Json[]): string =>
  JSON.stringify(values.map((value) => JSON.stringify(value)).toSorted());

const same = (left: readonly Schema.Json[], right: readonly Schema.Json[]) =>
  canonical(left) === canonical(right);

const grow =
  (members: readonly Member[], extra: Member): Visit =>
  (node) =>
    same(listOf(node, "enum"), members)
      ? set(node, "enum", [...listOf(node, "enum"), extra])
      : node;

const shrink =
  (members: readonly Member[], gone: Member): Visit =>
  (node) =>
    same(listOf(node, "enum"), members)
      ? set(
          node,
          "enum",
          members.filter((value) => value !== gone)
        )
      : node;

const bound =
  (key: string, from: number, to: number): Visit =>
  (node) =>
    node[key] === from ? set(node, key, to) : node;

const row =
  (members: readonly Member[], extra: string): Visit =>
  (node) => {
    const properties = node.properties ?? null;
    if (
      !isNode(properties) ||
      !same(Object.keys(properties), members.map(String))
    ) {
      return node;
    }
    const [first = null] = Object.values(properties);
    const grown = set(node, "properties", set(properties, extra, first));
    return node.required === undefined
      ? grown
      : set(grown, "required", [...listOf(node, "required"), extra]);
  };

const bikes = Bike.literals;
const roads = Road.literals;
const rivals = Rival.literals;
const racers = Racer.literals;

const addBike = edit(
  edit(base, grow(bikes, "review-bike")),
  bound("maxItems", bikes.length, bikes.length + 1),
  { Bike: [...bikes, "review-bike"] }
);
const addRoad = edit(
  edit(edit(base, grow(roads, "review-road")), row(roads, "review-road")),
  bound("maximum", roads.length, roads.length + 1),
  { Road: [...roads, "review-road"] }
);
const removeBike = edit(
  edit(base, shrink(bikes, "gutter-pup-250")),
  bound("maxItems", bikes.length, bikes.length - 1),
  { Bike: bikes.filter((bike) => bike !== "gutter-pup-250") }
);
const addRival = edit(
  edit(
    edit(
      edit(base, grow(rivals, "review-rival")),
      grow(racers, "review-rival")
    ),
    row(rivals, "review-rival")
  ),
  row(racers, "review-rival"),
  { Racer: [...racers, "review-rival"], Rival: [...rivals, "review-rival"] }
);
const addLevel = edit(
  edit(base, grow(Level.literals, 6)),
  row(Level.literals, "6"),
  { Level: [...Level.literals, 6] }
);

const reordered: Save = {
  catalogues: {
    Bike: bikes.toReversed(),
    Level: Level.literals.toReversed(),
    Officer: Officer.literals.toReversed(),
    Racer: racers.toReversed(),
    Rival: rivals.toReversed(),
    Road: roads.toReversed(),
    Weapon: Weapon.literals.toReversed(),
  },
  document: edit(base, (node) =>
    Object.fromEntries(
      Object.entries(node)
        .map(([key, value]): [string, Schema.Json] => {
          if (isList(value) && ["anyOf", "enum", "required"].includes(key)) {
            return [key, value.toReversed()];
          }
          return key === "properties" && isNode(value)
            ? [key, Object.fromEntries(Object.entries(value).toReversed())]
            : [key, value];
        })
        .toReversed()
    )
  ).document,
};

const documented = edit(base, (node) =>
  set(
    set(
      set(set(set(node, "$comment", "c"), "default", null), "description", "d"),
      "examples",
      []
    ),
    "title",
    "t"
  )
);

const local = (name: string): Save => {
  const schema = child(base.document, "schema");
  const properties = child(schema, "properties");
  return {
    catalogues: base.catalogues,
    document: set(
      set(base.document, "definitions", { [name]: child(properties, "story") }),
      "schema",
      set(
        schema,
        "properties",
        set(properties, "story", { $ref: `#/$defs/${name}` })
      )
    ),
  };
};

const singleton =
  (keepType: boolean): Visit =>
  (node) => {
    const values = listOf(node, "enum");
    if (values.length !== 1) {
      return node;
    }
    const constant = set(drop(node, "enum"), "const", values[0] ?? null);
    return keepType ? constant : drop(constant, "type");
  };

const nullable: Visit = (node) => {
  const [first = null, second = null] = listOf(node, "anyOf");
  if (!isNode(first) || !isNode(second) || second.type !== "null") {
    return node;
  }
  const typed = set(first, "type", [first.type ?? null, "null"]);
  return first.enum === undefined
    ? typed
    : set(typed, "enum", [...listOf(first, "enum"), null]);
};

const added = (name: string, required: boolean): Save =>
  top(
    (fields) => set(fields, name, { type: "string" }),
    (names) => (required ? [...names, name] : names)
  );

const renamed = top(
  (fields) =>
    Object.fromEntries(
      Object.entries(fields).map(([name, value]) => [
        name === "cash" ? "money" : name,
        value,
      ])
    ),
  (names) => names.map((name) => (name === "cash" ? "money" : name))
);

const without = (names: readonly Schema.Json[]) =>
  names.filter((name) => name !== "cash");

const narrowed = edit(base, (node) => {
  const properties = node.properties ?? null;
  const kind = isNode(properties) ? (properties.kind ?? null) : null;
  if (
    !isNode(properties) ||
    !isNode(kind) ||
    !same(listOf(kind, "enum"), ["weaponWanted"])
  ) {
    return node;
  }
  const weapon = child(properties, "weapon");
  const kept = listOf(weapon, "enum").filter((value) => value !== "sign");
  return set(
    node,
    "properties",
    set(properties, "weapon", set(weapon, "enum", kept))
  );
});

const text = (save: Save): string => JSON.stringify(save.document);

const wireOf = (save: Save): string => {
  const wire = wireFingerprintOf(text(save), save.catalogues);
  if (!wire.ok) {
    throw new Error(wire.problem);
  }
  return wire.value;
};

const entryOf = (version: number, save: Save): Entry => ({
  catalogues: save.catalogues,
  fingerprint: legacyFingerprintOf(text(save)),
  version,
  wireFingerprint: wireOf(save),
});

const seed = entryOf(2, base);
const listing = (save: Save): Entry => ({
  ...seed,
  catalogues: save.catalogues,
});

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

const register = (dir: string, versions: readonly Entry[]) => {
  writeFileSync(path.join(dir, REGISTRY), JSON.stringify({ versions }));
};

const commit = (dir: string, file = REGISTRY) => {
  git(dir, ["add", "--", file]);
  git(dir, ["commit", "--quiet", "-m", "registry"]);
};

const seeded = (): string => {
  const dir = repository();
  register(dir, [seed]);
  commit(dir);
  return dir;
};

const check = (dir: string, version: number, save: Save) =>
  checkSaveFormat({
    catalogues: save.catalogues,
    cwd: dir,
    document: text(save),
    version,
  });

const lost = (id: string) =>
  `no longer lists ["${id}"] in the Bike catalogue of version 2, which a committed registry listed.`;

const structure =
  /^The save's structure no longer matches the wireFingerprint of version 2\. A changed save structure needs a new SAVE_VERSION/u;

describe("check:save-format", () => {
  afterEach(() => {
    for (const dir of repositories.splice(0)) {
      rmSync(dir, { force: true, recursive: true });
    }
  });

  it.each([
    ["the unchanged save", base],
    ["a new bike with its registry membership appended", addBike],
    ["a new road with its optional qualified keys", addRoad],
    ["every declaration and catalogue in reverse order", reordered],
    ["documentation on every schema node", documented],
    ["a field behind a local reference", local("Story")],
    ["the reference under another local name", local("CareerStory")],
    [
      "every singleton enum as const with its type",
      edit(base, singleton(true)),
    ],
    ["every singleton enum as a bare const", edit(base, singleton(false))],
    ["every nullable as a type list", edit(base, nullable)],
  ])("%s keeps version 2 and its wireFingerprint", (name, save) => {
    const dir = seeded();
    register(dir, [listing(save)]);
    expect([
      text(save) === text(base),
      wireOf(save),
      check(dir, 2, save),
    ]).toStrictEqual([name === "the unchanged save", seed.wireFingerprint, []]);
  });

  it.each([
    [
      "a structural tag added to story.envelope",
      edit(base, grow(["unseen", "offered", "taken", "refused"], "lost")),
      structure,
    ],
    ["an optional field named title", added("title", false), structure],
    ["an ordinary optional field", added("nickname", false), structure],
    ["a required field", added("nickname", true), structure],
    ["a renamed field", renamed, structure],
    [
      "a removed field",
      top((fields) => drop(fields, "cash"), without),
      structure,
    ],
    [
      "a required field made optional",
      top((fields) => fields, without),
      structure,
    ],
    [
      "a field made nullable",
      top((fields) =>
        set(fields, "cash", {
          anyOf: [child(fields, "cash"), { type: "null" }],
        })
      ),
      structure,
    ],
    [
      "a fixed text bound raised",
      edit(base, bound("maxLength", 300, 301)),
      structure,
    ],
    ["a required rival row", addRival, structure],
    ["a required level row", addLevel, structure],
    [
      "a catalogue-sized bound raised without a new bike",
      top((fields) =>
        set(fields, "garage", set(child(fields, "garage"), "maxItems", 10))
      ),
      /^`garage` has a bound that follows the size of the Bike catalogue, 9 IDs, but its schema is .*"maxItems":10/u,
    ],
    [
      "one catalogue field narrowed",
      narrowed,
      /^`board\[\]\.weapon` holds the Weapon catalogue, so it accepts each of its 7 IDs and nothing else, but its schema lacks \["sign"\] and adds \[\]\. That changes the save's structure/u,
    ],
    [
      "a keyword the adapter does not read",
      edit(base, (node) =>
        node.maxLength === undefined ? node : set(node, "pattern", "^.*$")
      ),
      /^The save's JSON Schema has the keyword "pattern" at `.+`, which scripts\/save-wire\.ts does not read\..* needs no new SAVE_VERSION\.$/u,
    ],
  ])("%s is red at version 2", (_name, save, problem) => {
    const dir = seeded();
    register(dir, [listing(save)]);
    expect(check(dir, 2, save)).toStrictEqual([expect.stringMatching(problem)]);
  });

  it("a catalogue ID a committed registry listed stays, even after the schema and the registry drop it", () => {
    const shrunk = seeded();
    register(shrunk, [listing(removeBike)]);
    const kept = seeded();
    const grown = seeded();
    register(grown, [listing(addBike)]);
    commit(grown);
    register(grown, [seed]);
    expect([
      check(shrunk, 2, removeBike),
      check(kept, 2, removeBike),
      check(grown, 2, base),
      check(grown, 2, addBike),
    ]).toStrictEqual([
      [expect.stringContaining(lost("gutter-pup-250"))],
      [
        expect.stringContaining(
          'lists ["gutter-pup-250"] in the Bike catalogue, which the schema does not have.'
        ),
      ],
      [expect.stringContaining(lost("review-bike"))],
      [
        expect.stringContaining(lost("review-bike")),
        expect.stringContaining(
          `The schema's Bike catalogue has ["review-bike"]`
        ),
      ],
    ]);
  });

  it("the schema and the registry list the same catalogue IDs", () => {
    const behind = seeded();
    const ahead = seeded();
    register(ahead, [listing(addBike)]);
    expect([check(behind, 2, addBike), check(ahead, 2, base)]).toStrictEqual([
      [
        expect.stringMatching(
          /^The schema's Bike catalogue has \["review-bike"\], which version 2 in .* does not list\..* needs no new SAVE_VERSION\.$/u
        ),
      ],
      [
        expect.stringContaining(
          'lists ["review-bike"] in the Bike catalogue, which the schema does not have.'
        ),
      ],
    ]);
  });

  it("a changed structure stays red after its wireFingerprint is rewritten and committed, and is green as version 3 once committed", () => {
    const changed = added("nickname", false);
    const dir = seeded();
    register(dir, [{ ...seed, wireFingerprint: wireOf(changed) }]);
    const rewritten = check(dir, 2, changed);
    commit(dir);
    const committed = check(dir, 2, changed);
    register(dir, [seed, entryOf(3, changed)]);
    const uncommitted = check(dir, 3, changed);
    commit(dir);
    const anchored = `changes the wireFingerprint of version 2, which was committed as ${wireOf(base)}.`;
    expect({
      below: check(dir, 2, base),
      bumped: check(dir, 3, changed),
      committed,
      rewritten,
      uncommitted,
    }).toStrictEqual({
      below: [
        expect.stringContaining(
          `SAVE_VERSION is 2, but the highest version in ${REGISTRY} is 3`
        ),
      ],
      bumped: [],
      committed: [expect.stringContaining(anchored)],
      rewritten: [expect.stringContaining(anchored)],
      uncommitted: [
        expect.stringContaining("Version 3 has no committed wireFingerprint"),
      ],
    });
  });

  it("a committed version, its fingerprints and its catalogues are never removed or changed", () => {
    const required = added("nickname", true);
    const cases: readonly (readonly [Save, number, Entry])[] = [
      [base, 2, { ...seed, fingerprint: "0".repeat(64) }],
      [
        base,
        2,
        {
          catalogues: base.catalogues,
          fingerprint: seed.fingerprint,
          version: 2,
        },
      ],
      [
        base,
        2,
        {
          fingerprint: seed.fingerprint,
          version: 2,
          wireFingerprint: wireOf(base),
        },
      ],
      [required, 3, entryOf(3, required)],
    ];
    expect(
      cases.map(([save, version, entry]) => {
        const dir = seeded();
        register(dir, [entry]);
        return check(dir, version, save);
      })
    ).toStrictEqual([
      [
        expect.stringContaining(
          `changes the fingerprint of version 2, which was committed as ${seed.fingerprint}.`
        ),
      ],
      [
        expect.stringContaining(
          "drops the wireFingerprint of version 2, which was committed as"
        ),
      ],
      [
        expect.stringContaining(
          `Version 2 in ${REGISTRY} lists no catalogues.`
        ),
      ],
      [
        expect.stringContaining("no longer lists version 2"),
        expect.stringContaining("Version 3 has no committed wireFingerprint"),
      ],
    ]);
  });

  it("a registry without committed history, without the committed bridge, or in a shallow clone fails instead of passing", () => {
    const uncommitted = repository();
    writeFileSync(path.join(uncommitted, "README.md"), "Rushline\n");
    commit(uncommitted, "README.md");
    register(uncommitted, [seed]);
    const unbridged = repository();
    register(unbridged, [{ fingerprint: seed.fingerprint, version: 2 }]);
    commit(unbridged);
    register(unbridged, [seed]);
    const full = seeded();
    const required = added("nickname", true);
    register(full, [seed, entryOf(3, required)]);
    commit(full);
    const shallow = mkdtempSync(path.join(tmpdir(), "rushline-save-shallow-"));
    repositories.push(shallow);
    git(shallow, ["clone", "--quiet", "--depth", "1", `file://${full}`, "."]);
    expect([
      check(uncommitted, 2, base),
      check(unbridged, 2, base),
      check(shallow, 3, required),
      check(full, 3, required),
    ]).toStrictEqual([
      [expect.stringContaining("has no committed version")],
      [expect.stringContaining("Version 2 has no committed wireFingerprint")],
      [expect.stringContaining("This clone is shallow")],
      [],
    ]);
  });
});
