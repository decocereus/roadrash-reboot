import { parseArgs } from "node:util";

import { stateOfRun } from "./state.ts";
import type { InstanceState } from "./state.ts";

const DEFAULT_TIMEOUT_S = 60;

const print = (line: string) => {
  process.stdout.write(`${line}\n`);
};

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

  const deadline = (): number => Date.now() + Number(values.timeout) * 1000;

  return { command, deadline, print, rest, script, values };
};

export type CommandContext = ReturnType<typeof readCommandLine>;

export const requireRun = async (
  context: CommandContext
): Promise<InstanceState> => {
  const { values } = context;
  if (values.run === undefined || values.run === "") {
    throw new Error("Pass --run <id>; rv up prints it.");
  }
  return await stateOfRun(values.run);
};
