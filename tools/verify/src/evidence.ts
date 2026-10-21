import path from "node:path";

import { UsageError } from "@racer/devtools/usage-error";
import * as Clock from "effect/Clock";
import * as Context from "effect/Context";
import * as Effect from "effect/Effect";
import * as FileSystem from "effect/FileSystem";
import * as Layer from "effect/Layer";
import type * as PlatformError from "effect/PlatformError";
import * as Schema from "effect/Schema";

import type { InstanceState } from "./state.ts";

const consoleLine = Schema.Struct({
  kind: Schema.String,
  level: Schema.String,
  text: Schema.String,
});

type ConsoleLine = typeof consoleLine.Type;

const decodeConsoleLine = Schema.decodeUnknownEffect(
  Schema.fromJsonString(consoleLine)
);

export const consoleFile = (state: InstanceState): string =>
  path.join(state.evidence, "console.jsonl");

export const evidenceFile = (state: InstanceState, name: string) =>
  name === "" || name.includes("/") || name.startsWith(".")
    ? Effect.fail(
        new UsageError({
          message: "Name the artifact with a plain file name, like jump-air.",
        })
      )
    : Effect.succeed(path.join(state.evidence, name));

const KNOWN_NOISE = "favicon.ico";

export const isError = (line: ConsoleLine): boolean =>
  (line.level === "error" || line.kind === "exception") &&
  !line.text.includes(KNOWN_NOISE);

export class Evidence extends Context.Service<
  Evidence,
  {
    readonly journal: (
      command: string,
      state: InstanceState,
      result: string
    ) => Effect.Effect<void, PlatformError.PlatformError>;
    readonly consoleText: (
      state: InstanceState
    ) => Effect.Effect<string, PlatformError.PlatformError>;
    readonly readConsole: (
      state: InstanceState
    ) => Effect.Effect<
      readonly ConsoleLine[],
      PlatformError.PlatformError | Schema.SchemaError
    >;
  }
>()("@racer/verify/Evidence") {
  static readonly layer = Layer.effect(Evidence)(
    Effect.gen(function* makeEvidence() {
      const fs = yield* FileSystem.FileSystem;

      const journal = Effect.fn("Evidence.journal")(function* journal(
        command: string,
        state: InstanceState,
        result: string
      ) {
        const at = new Date(yield* Clock.currentTimeMillis).toISOString();
        yield* fs.writeFileString(
          path.join(state.evidence, "journal.jsonl"),
          `${JSON.stringify({ args: process.argv.slice(3), at, command, result })}\n`,
          { flag: "a" }
        );
      });

      const consoleText = (state: InstanceState) =>
        fs
          .readFileString(consoleFile(state), "utf-8")
          .pipe(
            Effect.catchReason("PlatformError", "NotFound", () =>
              Effect.succeed("")
            )
          );

      const readConsole = (state: InstanceState) =>
        consoleText(state).pipe(
          Effect.flatMap((text) =>
            Effect.all(
              text
                .split("\n")
                .filter(Boolean)
                .map((line) => decodeConsoleLine(line))
            )
          )
        );

      return Evidence.of({ consoleText, journal, readConsole });
    })
  );
}
