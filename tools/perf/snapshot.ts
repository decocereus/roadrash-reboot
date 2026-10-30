import * as NodeFileSystem from "@effect/platform-node/NodeFileSystem";
import * as NodeRuntime from "@effect/platform-node/NodeRuntime";
import { runCommand } from "@racer/devtools/cleanup";
import * as Effect from "effect/Effect";

import { snapshotChild } from "./src/node-snapshot.ts";

NodeRuntime.runMain(
  runCommand(snapshotChild(process.argv.slice(2)), "").pipe(
    Effect.provide(NodeFileSystem.layer)
  ),
  { disableErrorReporting: true }
);
