import { parseArgs } from "node:util";

import * as NodeChildProcessSpawner from "@effect/platform-node/NodeChildProcessSpawner";
import * as NodeFileSystem from "@effect/platform-node/NodeFileSystem";
import * as NodePath from "@effect/platform-node/NodePath";
import * as NodeRuntime from "@effect/platform-node/NodeRuntime";
import { runCommand } from "@racer/devtools/cleanup";
import { ToolProcesses } from "@racer/devtools/process";
import { UsageError } from "@racer/devtools/usage-error";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";

const SSH_TARGET = [
  "-o",
  "BatchMode=yes",
  "-o",
  "ConnectTimeout=10",
  "-o",
  "ServerAliveInterval=15",
  "-o",
  "ServerAliveCountMax=4",
  "-o",
  "HostKeyAlias=vimaan.local",
  "-o",
  "HostName=192.168.1.127",
  "vimaan",
] as const;
const LINK_DROPPED = 255;
const RETRY_MS = 15_000;
const RETRIES = 20;
const LOG_DIR = "/var/tmp/rushline-book";
const TAIL_LINES = 30;
const CHECKOUT = process.env.RUSHLINE_VIMAAN_CHECKOUT ?? "~/roadrash-reboot";

const HELP = `pnpm vimaan: book vimaan's bench queue and run work there over SSH

  pnpm vimaan status
  pnpm vimaan book <lane> <minutes> <purpose>              prints BOOKING=<id>
  pnpm vimaan wait <id> [--end]                            run it as a background command; it exits when it is your move
  pnpm vimaan run <id> --cwd <dir on vimaan> <label> -- <command> [args]
  pnpm vimaan release <id>

RUSHLINE_VIMAAN_CHECKOUT names the checkout on vimaan that runs rv book (default ~/roadrash-reboot).`;

const quoted = (word: string) =>
  /^[\w@%+=:,./-]+$/u.test(word) ? word : `'${word.replaceAll("'", `'\\''`)}'`;

const placeOf = (dir: string) =>
  dir.startsWith("~/") ? `~/${quoted(dir.slice(2))}` : quoted(dir);

const rvBook = (args: readonly string[]) =>
  `cd ${placeOf(CHECKOUT)} && node tools/verify/rushline.ts book ${args.map(quoted).join(" ")}`;

const say = (line: string) =>
  Effect.sync(() => {
    process.stderr.write(`pnpm vimaan: ${line}\n`);
  });

const onVimaan = (script: string) =>
  ToolProcesses.use((processes) =>
    processes.runShown("ssh", [...SSH_TARGET, script], process.env)
  );

const waitRemote = Effect.fnUntraced(function* waitRemote(
  id: string,
  untilEnd: boolean
) {
  const script = rvBook(untilEnd ? ["wait", id, "--end"] : ["wait", id]);
  let drops = 0;
  let code = yield* onVimaan(script);
  while (code === LINK_DROPPED) {
    drops += 1;
    if (drops >= RETRIES) {
      yield* say(
        `vimaan has been unreachable for ${RETRIES} tries in a row; check the network and run it again.`
      );
      return code;
    }
    yield* say(
      `the link to vimaan dropped; trying again in ${RETRY_MS / 1000} s (${drops} of ${RETRIES}).`
    );
    yield* Effect.sleep(RETRY_MS);
    code = yield* onVimaan(script);
  }
  return code;
});

const runJob = Effect.fnUntraced(function* runJob(
  id: string,
  dir: string,
  label: string,
  command: readonly string[]
) {
  const log = `${LOG_DIR}/${id}.log`;
  const code = yield* onVimaan(
    `mkdir -p ${LOG_DIR} && cd ${placeOf(dir)} && RUSHLINE_BOOKING=${quoted(id)} setsid -w nohup node tools/verify/rushline.ts bench ${quoted(label)} -- ${command.map(quoted).join(" ")} > ${quoted(log)} 2>&1 < /dev/null`
  );
  if (code === LINK_DROPPED) {
    yield* say(
      "the link dropped during the run, so its exit code is unknown; waiting for the booking's job to end."
    );
    yield* waitRemote(id, false);
  }
  yield* say(`last ${TAIL_LINES} lines of ${log} on vimaan:`);
  yield* onVimaan(`tail -n ${TAIL_LINES} ${quoted(log)}`);
  return code;
});

const usage = (message: string) =>
  Effect.fail(new UsageError({ message: `${message}\n\n${HELP}` }));

const commandLine = (argv: readonly string[]) => {
  const split = argv.indexOf("--");
  const head = split === -1 ? argv : argv.slice(0, split);
  return Effect.try({
    catch: (cause) =>
      new UsageError({ message: `${String(cause)}\n\n${HELP}` }),
    try: () => {
      const { positionals, values } = parseArgs({
        allowPositionals: true,
        args: [...head],
        options: {
          cwd: { type: "string" },
          end: { default: false, type: "boolean" },
        },
      });
      return {
        command: split === -1 ? [] : argv.slice(split + 1),
        positionals,
        values,
      };
    },
  });
};

const dispatch = Effect.fnUntraced(function* dispatch(argv: readonly string[]) {
  const { command, positionals, values } = yield* commandLine(argv);
  const [action = "help", id, label] = positionals;
  switch (action) {
    case "status": {
      return yield* onVimaan(rvBook(["status"]));
    }
    case "book": {
      return yield* onVimaan(rvBook(positionals.slice(1)));
    }
    case "release": {
      return yield* onVimaan(rvBook(positionals));
    }
    case "wait": {
      return id === undefined
        ? yield* usage("pnpm vimaan wait takes the booking's id.")
        : yield* waitRemote(id, values.end);
    }
    case "run": {
      return id === undefined ||
        label === undefined ||
        values.cwd === undefined ||
        command.length === 0
        ? yield* usage(
            "pnpm vimaan run takes the booking's id, --cwd with the checkout on vimaan, a label, then -- and the command."
          )
        : yield* runJob(id, values.cwd, label, command);
    }
    default: {
      yield* Effect.sync(() => {
        process.stdout.write(`${HELP}\n`);
      });
      return 0;
    }
  }
});

const main = Effect.gen(function* main() {
  const code = yield* dispatch(process.argv.slice(2));
  yield* Effect.sync(() => {
    process.exitCode = code;
  });
});

NodeRuntime.runMain(
  runCommand(main, "pnpm vimaan: ").pipe(
    Effect.provide(
      ToolProcesses.layer.pipe(
        Layer.provide(NodeChildProcessSpawner.layer),
        Layer.provide(Layer.mergeAll(NodeFileSystem.layer, NodePath.layer))
      )
    )
  ),
  { disableErrorReporting: true }
);
