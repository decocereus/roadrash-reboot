import { runCommand } from "@racer/devtools/cleanup";
import type { CleanupOutcomes } from "@racer/devtools/cleanup";
import type { ToolProcesses } from "@racer/devtools/process";
import type * as Effect from "effect/Effect";
import type * as FileSystem from "effect/FileSystem";
import type * as HttpClient from "effect/http/HttpClient";
import type * as Scope from "effect/Scope";
import type * as Socket from "effect/socket/Socket";

import {
  ariaCommand,
  clickCommand,
  consoleCommand,
  jsCommand,
  listSlots,
  openPage,
  pressCommand,
  rebuild,
  sampleCommand,
  screencastCommand,
  shotCommand,
  throttleCommand,
  traceCommand,
  waitCommand,
} from "./commands.ts";
import { readCommandLine } from "./context.ts";
import type { CommandContext } from "./context.ts";
import { doctor } from "./doctor.ts";
import type { Evidence } from "./evidence.ts";
import { down, up } from "./lifecycle.ts";
import type { SlotStore } from "./state.ts";
import { watch } from "./watcher.ts";

const HELP = `rv: drive a Rushline verification instance in a windowed Helium over DevTools

  rv up [--dev] [--path /?ride=...] [--slot n] [--cpu n] [--network fast4g|slow4g|3g] [--sound]
  rv up --server http://127.0.0.1:1351/ --user-asked     only when the user said to drive their server
  rv list
  rv doctor     --run <id>
  rv open       --run <id> /?ride=slag-row&autopilot&prof [--until bar|race|held|<js>]
  rv js         --run <id> <js expression>
  rv wait       --run <id> bar|race|held|<js> [--timeout s]
  rv press      --run <id> ArrowUp KeyJ [--hold ms]
  rv click      --run <id> <visible label> [--within <aria-label>]
  rv shot       --run <id> <name>
  rv aria       --run <id> <name>
  rv screencast --run <id> <name> [--seconds s] [--every n]
  rv trace      --run <id> <name> [--seconds s]
  rv sample     --run <id> <name> [--seconds s]
  rv throttle   --run <id> [--cpu n] [--network off|fast4g|slow4g|3g]
  rv console    --run <id> [errors]
  rv rebuild    --run <id>
  rv down       --run <id>`;

type Handler = (
  context: CommandContext
) => Effect.Effect<
  void,
  unknown,
  | CleanupOutcomes
  | Evidence
  | FileSystem.FileSystem
  | HttpClient.HttpClient
  | Scope.Scope
  | SlotStore
  | Socket.WebSocketConstructor
  | ToolProcesses
>;

const commands = new Map<string, Handler>([
  ["aria", ariaCommand],
  ["click", clickCommand],
  ["console", consoleCommand],
  ["doctor", doctor],
  ["down", down],
  ["js", jsCommand],
  ["list", listSlots],
  ["open", openPage],
  ["press", pressCommand],
  ["rebuild", rebuild],
  ["sample", sampleCommand],
  ["screencast", screencastCommand],
  ["shot", shotCommand],
  ["throttle", throttleCommand],
  ["trace", traceCommand],
  ["up", up],
  ["wait", waitCommand],
  ["watch", watch],
]);

export const main = (script: string) => {
  const context = readCommandLine(script);
  const chosen = commands.get(context.command);
  return chosen
    ? runCommand(chosen(context), `rv ${context.command}: `)
    : context.print(HELP);
};
