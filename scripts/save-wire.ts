import { createHash } from "node:crypto";

import * as Schema from "effect/Schema";

export const domains = [
  "Bike",
  "Level",
  "Officer",
  "Racer",
  "Rival",
  "Road",
  "Weapon",
] as const;
type Domain = (typeof domains)[number];
export type Catalogues = Readonly<Record<Domain, readonly (string | number)[]>>;

export type Read<Value> =
  | { readonly ok: true; readonly value: Value }
  | { readonly ok: false; readonly problem: string };

export const refused = (problem: string): Read<never> => ({
  ok: false,
  problem,
});

type Literal = string | number | boolean;
type Bound = number | { readonly count: Domain };
type Wire =
  | {
      readonly items: Wire;
      readonly kind: "array";
      readonly maxItems: Bound | null;
    }
  | { readonly kind: "boolean" | "null" }
  | { readonly domain: Domain; readonly kind: "catalogue" }
  | {
      readonly kind: "integer" | "number";
      readonly maximum: Bound | null;
      readonly minimum: number | null;
    }
  | { readonly kind: "literals"; readonly values: readonly Literal[] }
  | { readonly keys: Domain; readonly kind: "map"; readonly value: Wire }
  | { readonly fields: readonly Field[]; readonly kind: "object" }
  | { readonly kind: "string"; readonly maxLength: number | null }
  | { readonly kind: "union"; readonly options: readonly Wire[] };
interface Field {
  readonly name: string;
  readonly optional: boolean;
  readonly value: Wire;
}

interface Role {
  readonly domain: Domain;
  readonly kind: "catalogue" | "items" | "keys" | "most";
}

const ids = (domain: Domain): Role => ({ domain, kind: "catalogue" });

const roles = {
  "activeRace.bikeId": ids("Bike"),
  "activeRace.level": ids("Level"),
  "activeRace.roadId": ids("Road"),
  bikeId: ids("Bike"),
  "board[].bikeId": ids("Bike"),
  "board[].loser": ids("Racer"),
  "board[].rival": ids("Rival"),
  "board[].roadId": ids("Road"),
  "board[].weapon": ids("Weapon"),
  "board[].winner": ids("Racer"),
  garage: { domain: "Bike", kind: "items" },
  "garage[]": ids("Bike"),
  "lastResult.ledger.level": ids("Level"),
  "lastResult.ledger.levelUp.bikes": { domain: "Bike", kind: "items" },
  "lastResult.ledger.levelUp.bikes[]": ids("Bike"),
  "lastResult.ledger.levelUp.level": ids("Level"),
  "lastResult.ledger.line.rival": ids("Rival"),
  "lastResult.ledger.qualifiedCount": { domain: "Road", kind: "most" },
  "lastResult.ledger.repossessed.bikeId": ids("Bike"),
  "lastResult.ledger.roadId": ids("Road"),
  "lastResult.summary.bust.officer": ids("Officer"),
  "lastResult.summary.bust.weapon": ids("Weapon"),
  "lastResult.summary.incidents[].rival": ids("Rival"),
  "lastResult.summary.incidents[].tookPlayerWeapon": ids("Weapon"),
  "lastResult.summary.incidents[].weaponTakenByPlayer": ids("Weapon"),
  "lastResult.summary.rows[].bikeId": ids("Bike"),
  "lastResult.summary.rows[].racer": ids("Racer"),
  "lastResult.summary.wreck.bikeId": ids("Bike"),
  level: ids("Level"),
  "qualified.*": { domain: "Road", kind: "keys" },
  "season.*.lastAhead": { domain: "Racer", kind: "keys" },
  weapon: ids("Weapon"),
} satisfies Record<string, Role>;

const keywords = new Map<string, readonly string[]>([
  ["array", ["items", "maxItems"]],
  ["boolean", []],
  ["integer", ["maximum", "minimum"]],
  ["null", []],
  ["number", ["maximum", "minimum"]],
  ["object", ["additionalProperties", "properties", "required"]],
  ["string", ["maxLength"]],
]);
const literalKeywords = new Set(["const", "enum", "type"]);
const documentation = new Set([
  "$comment",
  "default",
  "description",
  "examples",
  "title",
]);
const definitionPrefix = "#/$defs/";

type Path = readonly string[];

interface Context {
  readonly catalogues: Catalogues;
  readonly definitions: Schema.JsonObject;
  readonly describe: (value: Schema.Json, at: Path, context: Context) => Wire;
  readonly hits: Set<string>;
  readonly seen: readonly string[];
}

const decodeDocument = Schema.decodeUnknownSync(
  Schema.fromJsonString(
    Schema.Struct({ definitions: Schema.JsonObject, schema: Schema.JsonObject })
  )
);

const isText = Schema.is(Schema.String);
const isNumber = Schema.is(Schema.Finite);
const isWhole = Schema.is(Schema.Int);
const isBoolean = Schema.is(Schema.Boolean);

const isList = (value: Schema.Json): value is Schema.JsonArray =>
  Array.isArray(value);

const isRecord = (value: Schema.Json): value is Schema.JsonObject =>
  value !== null && !isList(value) && Object(value) === value;

const accepts = new Map<string, (value: Literal | null) => boolean>([
  ["boolean", (value) => isBoolean(value)],
  ["integer", (value) => isWhole(value)],
  ["null", (value) => value === null],
  ["number", (value) => isNumber(value)],
  ["string", (value) => isText(value)],
]);

const order = (left: string, right: string): number =>
  Number(left > right) - Number(left < right);

const encode = (value: Wire | Literal): string => JSON.stringify(value);

const where = (at: Path): string =>
  at.length === 0 ? "the save" : `\`${at.join(".")}\``;

export const listed = (values: readonly string[]): string =>
  `[${values.join(", ")}]`;

export const membersOf = (catalogues: Catalogues, domain: Domain) => [
  ...new Set(catalogues[domain].map((member) => JSON.stringify(member))),
];

const cannotRead = (at: Path, what: string): never => {
  throw new Error(
    `The save's JSON Schema has ${what} at ${where(at)}, which scripts/save-wire.ts does not read. Teach the adapter that construct, with evidence that it accepts the same values, so every committed wireFingerprint stays the same. How the schema is written is not the save's structure and needs no new SAVE_VERSION.`
  );
};

const changed = (message: string): never => {
  throw new Error(
    `${message} That changes the save's structure, which needs a new SAVE_VERSION agreed with the owner.`
  );
};

const unite = (options: readonly Wire[]): Wire => {
  const flat = options.flatMap((option) =>
    option.kind === "union" ? option.options : [option]
  );
  const values = [
    ...new Map(
      flat
        .flatMap((option) => (option.kind === "literals" ? option.values : []))
        .map((value) => [encode(value), value])
    ),
  ].toSorted(([left], [right]) => order(left, right));
  const merged: readonly Wire[] = [
    ...flat.filter((option) => option.kind !== "literals"),
    ...(values.length === 0
      ? []
      : [
          {
            kind: "literals" as const,
            values: values.map(([, value]) => value),
          },
        ]),
  ];
  const unique = [
    ...new Map(merged.map((option) => [encode(option), option])),
  ].toSorted(([left], [right]) => order(left, right));
  const [only] = unique;
  if (only !== undefined && unique.length === 1) {
    return only[1];
  }
  return { kind: "union", options: unique.map(([, option]) => option) };
};

const typeNames = (type: Schema.Json, at: Path): readonly string[] => {
  const names = isText(type) ? [type] : type;
  if (isList(names) && names.length > 0) {
    const known = names.filter((name) => isText(name) && keywords.has(name));
    if (known.length === names.length) {
      return known.filter((name) => isText(name));
    }
  }
  return cannotRead(at, `the type ${JSON.stringify(type)}`);
};

const literalOf = (value: Schema.Json, at: Path): Literal | null => {
  if (value === null || isText(value) || isNumber(value) || isBoolean(value)) {
    return value;
  }
  return cannotRead(at, `the literal ${JSON.stringify(value)}`);
};

const countOf = (value: Schema.Json | undefined, at: Path): number | null => {
  if (value === undefined) {
    return null;
  }
  return isWhole(value) && value >= 0
    ? value
    : cannotRead(at, `the length bound ${JSON.stringify(value)}`);
};

const boundOf = (value: Schema.Json | undefined, at: Path): number | null => {
  if (value === undefined) {
    return null;
  }
  return isNumber(value)
    ? value
    : cannotRead(at, `the numeric bound ${JSON.stringify(value)}`);
};

const literalsOf = (
  value: Schema.JsonObject,
  keys: readonly string[],
  at: Path
): Wire => {
  const { const: constant, enum: listing, type } = value;
  const found = constant === undefined ? listing : [constant];
  if (
    keys.some((key) => !literalKeywords.has(key)) ||
    (constant !== undefined && listing !== undefined) ||
    found === undefined ||
    !isList(found) ||
    found.length === 0
  ) {
    return cannotRead(at, `the literal set ${JSON.stringify(value)}`);
  }
  const literals = found.map((item) => literalOf(item, at));
  const names = type === undefined ? [...accepts.keys()] : typeNames(type, at);
  if (
    literals.some(
      (literal) => !names.some((name) => accepts.get(name)?.(literal) === true)
    )
  ) {
    return cannotRead(
      at,
      `a literal outside its type in ${JSON.stringify(value)}`
    );
  }
  return unite(
    literals.map((literal): Wire =>
      literal === null
        ? { kind: "null" }
        : { kind: "literals", values: [literal] }
    )
  );
};

const objectOf = (
  value: Schema.JsonObject,
  at: Path,
  context: Context
): Wire => {
  const { additionalProperties, properties = {}, required = [] } = value;
  if (additionalProperties !== false) {
    return cannotRead(at, "an object that accepts keys it does not declare");
  }
  if (!isRecord(properties) || !isList(required)) {
    return cannotRead(at, "an object without readable properties");
  }
  const undeclared = required.filter(
    (name) => !isText(name) || !Object.hasOwn(properties, name)
  );
  if (undeclared.length > 0) {
    return cannotRead(at, `the required entries ${JSON.stringify(undeclared)}`);
  }
  return {
    fields: Object.entries(properties)
      .toSorted(([left], [right]) => order(left, right))
      .map(([name, field]) => ({
        name,
        optional: !required.includes(name),
        value: context.describe(field, [...at, name], context),
      })),
    kind: "object",
  };
};

const primitive = (
  name: string,
  value: Schema.JsonObject,
  at: Path,
  context: Context
): Wire => {
  if (name === "object") {
    return objectOf(value, at, context);
  }
  if (name === "array") {
    const { items, maxItems } = value;
    if (items === undefined || !isRecord(items)) {
      return cannotRead(at, "an array without one item schema");
    }
    const itemAt = [...at.slice(0, -1), `${at.at(-1) ?? ""}[]`];
    return {
      items: context.describe(items, itemAt, context),
      kind: "array",
      maxItems: countOf(maxItems, at),
    };
  }
  if (name === "string") {
    return { kind: "string", maxLength: countOf(value.maxLength, at) };
  }
  if (name === "integer" || name === "number") {
    return {
      kind: name,
      maximum: boundOf(value.maximum, at),
      minimum: boundOf(value.minimum, at),
    };
  }
  if (name === "boolean" || name === "null") {
    return { kind: name };
  }
  return cannotRead(at, `the type ${JSON.stringify(name)}`);
};

const wireOf = (value: Schema.Json, at: Path, context: Context): Wire => {
  if (!isRecord(value)) {
    return cannotRead(at, `the schema ${JSON.stringify(value)}`);
  }
  const keys = Object.keys(value).filter((key) => !documentation.has(key));
  const { $ref: reference, anyOf, type } = value;
  if (reference !== undefined) {
    const target = Object.entries(context.definitions).find(
      ([name]) => reference === `${definitionPrefix}${name}`
    );
    if (
      keys.length > 1 ||
      target === undefined ||
      context.seen.includes(target[0])
    ) {
      return cannotRead(at, `the reference ${JSON.stringify(reference)}`);
    }
    const [name, definition] = target;
    return wireOf(definition, at, {
      ...context,
      seen: [...context.seen, name],
    });
  }
  if (anyOf !== undefined) {
    if (keys.length > 1 || !isList(anyOf) || anyOf.length === 0) {
      return cannotRead(at, `the union ${JSON.stringify(value)}`);
    }
    return unite(anyOf.map((option) => wireOf(option, at, context)));
  }
  if (keys.includes("const") || keys.includes("enum")) {
    return literalsOf(value, keys, at);
  }
  if (type === undefined) {
    return cannotRead(at, `the schema ${JSON.stringify(value)} with no type`);
  }
  const names = typeNames(type, at);
  const stray = keys.find(
    (key) =>
      key !== "type" &&
      !names.some((name) => keywords.get(name)?.includes(key) === true)
  );
  if (stray !== undefined) {
    return cannotRead(at, `the keyword ${JSON.stringify(stray)}`);
  }
  return unite(names.map((name) => primitive(name, value, at, context)));
};

const catalogueOf = (
  wire: Wire,
  role: Role,
  at: Path,
  members: readonly string[]
): Wire => {
  const accepted =
    wire.kind === "literals" ? wire.values.map((value) => encode(value)) : [];
  const missing = members.filter((member) => !accepted.includes(member));
  const extra = accepted.filter((value) => !members.includes(value));
  if (wire.kind === "literals" && missing.length + extra.length === 0) {
    return { domain: role.domain, kind: "catalogue" };
  }
  return changed(
    `${where(at)} holds the ${role.domain} catalogue, so it accepts each of its ${members.length} IDs and nothing else, but its schema ${wire.kind === "literals" ? `lacks ${listed(missing)} and adds ${listed(extra)}` : `is ${encode(wire)}`}.`
  );
};

const mapOf = (
  wire: Wire,
  role: Role,
  at: Path,
  members: readonly string[]
): Wire => {
  const fields = wire.kind === "object" ? wire.fields : [];
  const names = fields.map((field) => JSON.stringify(field.name));
  const [first] = fields;
  if (
    first !== undefined &&
    names.length === members.length &&
    members.every((member) => names.includes(member)) &&
    fields.every(
      (field) => field.optional && encode(field.value) === encode(first.value)
    )
  ) {
    return { keys: role.domain, kind: "map", value: first.value };
  }
  return changed(
    `${where(at)} maps each of the ${members.length} ${role.domain} IDs to one optional value of the same kind, but its schema has the keys ${listed(names)}, or a required key, or keys with different values.`
  );
};

const sizeOf = (wire: Wire, role: Role, at: Path, size: number): Wire => {
  if (
    role.kind === "items" &&
    wire.kind === "array" &&
    wire.maxItems === size
  ) {
    return {
      items: wire.items,
      kind: "array",
      maxItems: { count: role.domain },
    };
  }
  if (
    role.kind === "most" &&
    (wire.kind === "integer" || wire.kind === "number") &&
    wire.maximum === size
  ) {
    return {
      kind: wire.kind,
      maximum: { count: role.domain },
      minimum: wire.minimum,
    };
  }
  return changed(
    `${where(at)} has a bound that follows the size of the ${role.domain} catalogue, ${size} IDs, but its schema is ${encode(wire)}.`
  );
};

const describe = (value: Schema.Json, at: Path, context: Context): Wire => {
  const wire = wireOf(value, at, context);
  const match = Object.entries(roles).find(([pattern]) => {
    const parts = pattern.split(".");
    return (
      parts.length === at.length &&
      parts.every((part, index) => part === "*" || part === at[index])
    );
  });
  if (match === undefined) {
    return wire;
  }
  const [pattern, role] = match;
  context.hits.add(pattern);
  const members = membersOf(context.catalogues, role.domain);
  if (role.kind === "catalogue") {
    return catalogueOf(wire, role, at, members);
  }
  if (role.kind === "keys") {
    return mapOf(wire, role, at, members);
  }
  return sizeOf(wire, role, at, members.length);
};

export const wireFingerprintOf = (
  document: string,
  catalogues: Catalogues
): Read<string> => {
  try {
    const { definitions, schema } = decodeDocument(document);
    const context: Context = {
      catalogues,
      definitions,
      describe,
      hits: new Set(),
      seen: [],
    };
    const wire = describe(schema, [], context);
    const absent = Object.keys(roles).filter(
      (pattern) => !context.hits.has(pattern)
    );
    if (absent.length > 0) {
      return refused(
        `The save has no ${listed(absent)}, which scripts/save-wire.ts names as catalogue fields. A removed or renamed field changes the save's structure, which needs a new SAVE_VERSION agreed with the owner.`
      );
    }
    return {
      ok: true,
      value: createHash("sha256").update(encode(wire)).digest("hex"),
    };
  } catch (error) {
    return refused(error instanceof Error ? error.message : String(error));
  }
};

const legacyUnordered = new Set(["anyOf", "enum", "oneOf", "required", "type"]);

const legacy = (
  value: Schema.Json,
  definitions: Schema.JsonObject,
  seen: readonly string[]
): Schema.Json => {
  if (isList(value)) {
    return value.map((item) => legacy(item, definitions, seen));
  }
  if (!isRecord(value)) {
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
    return legacy(target[1], definitions, [...seen, target[0]]);
  }
  const keys = Object.keys(rest)
    .filter((key) => !documentation.has(key))
    .toSorted();
  if (keys.length === 0) {
    throw new Error("An unconstrained schema has no wire description.");
  }
  return Object.fromEntries(
    keys.map((key) => {
      const field = rest[key] ?? null;
      if (key === "properties" && isRecord(field)) {
        return [
          key,
          Object.fromEntries(
            Object.keys(field)
              .toSorted()
              .map((name) => [
                name,
                legacy(field[name] ?? null, definitions, seen),
              ])
          ),
        ];
      }
      const inner = legacy(field, definitions, seen);
      return [
        key,
        legacyUnordered.has(key) && isList(inner)
          ? inner.toSorted((left, right) =>
              JSON.stringify(left).localeCompare(JSON.stringify(right))
            )
          : inner,
      ];
    })
  );
};

export const legacyFingerprintOf = (document: string): string => {
  const { definitions, schema } = decodeDocument(document);
  return createHash("sha256")
    .update(JSON.stringify(legacy(schema, definitions, [])))
    .digest("hex");
};
