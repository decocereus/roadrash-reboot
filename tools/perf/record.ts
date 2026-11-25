import * as NodeFileSystem from "@effect/platform-node/NodeFileSystem";
import * as NodeRuntime from "@effect/platform-node/NodeRuntime";
import { runCommand } from "@racer/devtools/cleanup";
import * as Console from "effect/Console";
import * as Effect from "effect/Effect";

import { recordMain } from "./src/record.ts";

NodeRuntime.runMain(
  runCommand(
    recordMain(process.argv.slice(2)).pipe(
      Effect.flatMap((lines) => Console.log(lines.join("\n")))
    ),
    "record: "
  ).pipe(Effect.provide(NodeFileSystem.layer)),
  { disableErrorReporting: true }
);
