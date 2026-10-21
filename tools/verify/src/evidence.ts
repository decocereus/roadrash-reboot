import { appendFile, readFile } from "node:fs/promises";
import path from "node:path";

import * as Schema from "effect/Schema";

import type { InstanceState } from "./state.ts";

export const journal = async (
  command: string,
  state: InstanceState,
  result: string
) => {
  await appendFile(
    path.join(state.evidence, "journal.jsonl"),
    `${JSON.stringify({ args: process.argv.slice(3), at: new Date().toISOString(), command, result })}\n`
  );
};

export const evidenceFile = (state: InstanceState, name: string): string => {
  if (name === "" || name.includes("/") || name.startsWith(".")) {
    throw new Error("Name the artifact with a plain file name, like jump-air.");
  }
  return path.join(state.evidence, name);
};

const consoleLine = Schema.Struct({
  kind: Schema.String,
  level: Schema.String,
  text: Schema.String,
});

const decodeConsoleLine = Schema.decodeUnknownSync(
  Schema.fromJsonString(consoleLine)
);

export const readConsole = async (
  state: InstanceState
): Promise<(typeof consoleLine.Type)[]> => {
  const text = await readFile(
    path.join(state.evidence, "console.jsonl"),
    "utf-8"
  ).catch(() => "");
  return text
    .split("\n")
    .filter(Boolean)
    .map((line) => decodeConsoleLine(line));
};

const KNOWN_NOISE = "favicon.ico";

export const isError = (line: typeof consoleLine.Type): boolean =>
  (line.level === "error" || line.kind === "exception") &&
  !line.text.includes(KNOWN_NOISE);
