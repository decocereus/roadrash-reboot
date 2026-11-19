import * as NodeFileSystem from "@effect/platform-node/NodeFileSystem";
import * as NodeRuntime from "@effect/platform-node/NodeRuntime";
import { runCommand } from "@racer/devtools/cleanup";
import * as Effect from "effect/Effect";

import { passingChild } from "./src/node-passing.ts";

NodeRuntime.runMain(
  runCommand(passingChild(process.argv.slice(2)), "").pipe(
    Effect.provide(NodeFileSystem.layer)
  ),
  { disableErrorReporting: true }
);
