import { parseArgs } from "node:util";

import { UsageError } from "@racer/devtools/usage-error";
import * as Clock from "effect/Clock";
import * as Effect from "effect/Effect";

import { SlotStore } from "./state.ts";

const DEFAULT_TIMEOUT_S = 60;

const print = (line: string) =>
  Effect.sync(() => {
    process.stdout.write(`${line}\n`);
  });

export const readCommandLine = (script: string) => {
  const { positionals, values } = parseArgs({
    allowPositionals: true,
    options: {
      cpu: { type: "string" },
      dev: { default: false, type: "boolean" },
      every: { default: "1", type: "string" },
      hold: { default: "120", type: "string" },
      network: { type: "string" },
      path: { default: "/", type: "string" },
      run: { type: "string" },
      seconds: { default: "5", type: "string" },
      server: { type: "string" },
      slot: { type: "string" },
      sound: { default: false, type: "boolean" },
      timeout: { default: String(DEFAULT_TIMEOUT_S), type: "string" },
      until: { type: "string" },
      "user-asked": { default: false, type: "boolean" },
      within: { default: "", type: "string" },
    },
  });

  const [command = "help", ...rest] = positionals;

  const deadline = Clock.currentTimeMillis.pipe(
    Effect.map((now) => now + Number(values.timeout) * 1000)
  );

  return { command, deadline, print, rest, script, values };
};

export type CommandContext = ReturnType<typeof readCommandLine>;

export const requireRun = Effect.fn("rv.requireRun")(function* requireRun(
  context: CommandContext
) {
  const { values } = context;
  if (values.run === undefined || values.run === "") {
    return yield* new UsageError({
      message: "Pass --run <id>; rv up prints it.",
    });
  }
  const slots = yield* SlotStore;
  return yield* slots.stateOfRun(values.run);
});
