import { parseArgs } from "node:util";

import { UsageError } from "@racer/devtools/usage-error";
import { tiers as allTiers } from "@racer/sim/difficulty";
import type { Tier } from "@racer/sim/difficulty";
import { roadIds } from "@racer/track/road";
import type { RoadId } from "@racer/track/road";
import * as Effect from "effect/Effect";

const fields = ["default", "career"] as const;
const pacings = ["on", "off"] as const;

export type Field = (typeof fields)[number];
export type Pacing = (typeof pacings)[number];

const seedList = [
  11, 23, 37, 41, 59, 67, 73, 89, 97, 101, 103, 107, 109, 113, 127, 131, 137,
  139, 149, 151, 157, 163, 167, 173, 179, 181, 191, 193, 197, 199, 211, 223,
  227, 229, 233, 239, 241, 251, 257, 263, 269, 271, 277, 281, 283, 293, 307,
  311, 313, 317, 331, 337, 347, 349, 353, 359, 367, 373, 379, 383,
] as const;

const DEFAULT_SEED_COUNT = 30;

export interface Options {
  readonly field: Field;
  readonly out: string | undefined;
  readonly pacing: Pacing;
  readonly plan: string | undefined;
  readonly road: RoadId;
  readonly seeds: readonly number[];
  readonly tiers: readonly Tier[];
}

const usage = [
  "Usage: pnpm road:test --road <roadId> [--tiers 1,3] [--seeds <count>]",
  "  [--field default|career] [--pacing on|off] [--plan <module path>] [--out <json path>]",
].join("\n");

const refuse = (problem: string) =>
  new UsageError({ message: `${problem}\n${usage}` });

const chosen = <Value extends string | number>(
  flag: string,
  allowed: readonly Value[],
  text: string | undefined
) => {
  const value = allowed.find((each) => String(each) === text);
  return value === undefined
    ? Effect.fail(
        refuse(`--${flag} must be one of ${allowed.join(", ")}, not ${text}.`)
      )
    : Effect.succeed(value);
};

const seedsOf = (text: string) => {
  const count = /^\d+$/u.test(text) ? Number(text) : 0;
  return count >= 1 && count <= seedList.length
    ? Effect.succeed(seedList.slice(0, count))
    : Effect.fail(
        refuse(`--seeds must be a count from 1 to ${seedList.length}.`)
      );
};

export const readOptions = Effect.fn("roadTest.readOptions")(
  function* readOptions(args: readonly string[]) {
    const { values } = yield* Effect.try({
      catch: (cause) => refuse(String(cause)),
      try: () =>
        parseArgs({
          args: [...args],
          options: {
            field: { default: "default", type: "string" },
            out: { type: "string" },
            pacing: { default: "on", type: "string" },
            plan: { type: "string" },
            road: { type: "string" },
            seeds: { default: String(DEFAULT_SEED_COUNT), type: "string" },
            tiers: { default: allTiers.join(","), type: "string" },
          },
        }),
    });
    const tiers: Tier[] = [];
    for (const tier of values.tiers.split(",")) {
      tiers.push(yield* chosen("tiers", allTiers, tier));
    }
    const options: Options = {
      field: yield* chosen("field", fields, values.field),
      out: values.out,
      pacing: yield* chosen("pacing", pacings, values.pacing),
      plan: values.plan,
      road: yield* chosen("road", roadIds, values.road),
      seeds: yield* seedsOf(values.seeds),
      tiers,
    };
    return options;
  }
);
