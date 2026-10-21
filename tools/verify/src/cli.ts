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
import { down, up } from "./lifecycle.ts";
import { watch } from "./watcher.ts";

const HELP = `rv: drive a Rushline verification instance in a windowed Helium over DevTools

  rv up [--dev] [--path /?ride=...] [--slot n] [--cpu n] [--network fast4g|slow4g|3g] [--sound]
  rv up --server http://127.0.0.1:1351/ --user-asked     only when the user said to drive their server
  rv list
  rv doctor     --run <id>
  rv open       --run <id> /?ride=slag-row&autopilot&prof [--until title|race|held|<js>]
  rv js         --run <id> <js expression>
  rv wait       --run <id> title|race|held|<js> [--timeout s]
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

const commands = new Map<string, (context: CommandContext) => Promise<void>>([
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

export const main = async (script: string): Promise<void> => {
  const context = readCommandLine(script);
  const { command, print } = context;
  const chosen = commands.get(command);
  if (chosen) {
    try {
      await chosen(context);
    } catch (error) {
      process.stderr.write(
        `rv ${command}: ${error instanceof Error ? error.message : String(error)}\n`
      );
      process.exitCode = 1;
    }
  } else {
    print(HELP);
  }
};
