import * as Predicate from "effect/Predicate";
import type { SchemaError } from "effect/Schema";
import * as SchemaAST from "effect/SchemaAST";
import * as SchemaIssue from "effect/SchemaIssue";

import { EncodedSaveSchema } from "./save-schema.ts";

type Path = readonly PropertyKey[];

const preamble = [
  "weapon",
  "qualified",
  "season",
  "memory",
  "garage",
  "bikeId",
];
const containers = new Set(["qualified", "season", "memory"]);
const body = [
  "activeRace",
  "board",
  "cash",
  "gameOver",
  "lastResult",
  "level",
  "memory",
  "qualified",
  "record",
  "season",
  "seed",
  "story",
  "weaponHits",
];

const format = SchemaIssue.makeFormatterStandardSchemaV1();

export const issuePaths = (error: SchemaError): readonly Path[] =>
  format(error.issue).issues.map((issue) =>
    (issue.path ?? []).map((segment) =>
      Predicate.hasProperty(segment, "key") ? segment.key : segment
    )
  );

const topRank = (path: Path): number => {
  const head = String(path[0]);
  if (preamble.includes(head) && (path.length === 1 || !containers.has(head))) {
    return preamble.indexOf(head);
  }
  return preamble.length + body.indexOf(head);
};

const propertyOf = (ast: SchemaAST.AST, key: PropertyKey) =>
  SchemaAST.isObjects(ast)
    ? ast.propertySignatures.find((property) => property.name === key)
    : undefined;

const stepOf = (
  ast: SchemaAST.AST,
  key: PropertyKey
): readonly [number, SchemaAST.AST | undefined] => {
  if (SchemaAST.isUnion(ast)) {
    const present = ast.types.find((type) => !SchemaAST.isNull(type));
    return present === undefined ? [0, undefined] : stepOf(present, key);
  }
  if (SchemaAST.isArrays(ast)) {
    return [Number(key), ast.rest[0]];
  }
  if (SchemaAST.isObjects(ast)) {
    const index = ast.propertySignatures.findIndex(
      (property) => property.name === key
    );
    return [index, ast.propertySignatures[index]?.type];
  }
  return [0, undefined];
};

const rankOf = (path: Path): readonly number[] => {
  const ranks = [topRank(path)];
  if (path[0] === "activeRace" && path[1] === "started") {
    return [...ranks, -1];
  }
  let ast = propertyOf(EncodedSaveSchema.ast, path[0] ?? "")?.type;
  for (const key of path.slice(1)) {
    if (ast === undefined) {
      break;
    }
    const [rank, next] = stepOf(ast, key);
    ranks.push(rank);
    ast = next;
  }
  return ranks;
};

const compareRanks = (
  left: readonly number[],
  right: readonly number[]
): number => {
  for (const [index, rank] of left.entries()) {
    const other = right[index];
    if (other === undefined) {
      return 1;
    }
    if (rank !== other) {
      return rank - other;
    }
  }
  return left.length - right.length;
};

const reported = (path: Path): Path =>
  path[0] === "board" ? path.slice(0, 2) : path;

export const firstField = (paths: readonly Path[]): string => {
  const [first] = paths
    .map((path) => ({ path: reported(path), rank: rankOf(reported(path)) }))
    .toSorted((left, right) => compareRanks(left.rank, right.rank));
  return (first?.path ?? []).map(String).join(".");
};
