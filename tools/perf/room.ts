import * as NodeFileSystem from "@effect/platform-node/NodeFileSystem";
import * as NodeRuntime from "@effect/platform-node/NodeRuntime";
import { runCommand } from "@racer/devtools/cleanup";
import * as Effect from "effect/Effect";

import { roomChild } from "./src/node-room.ts";

NodeRuntime.runMain(
  runCommand(roomChild(process.argv.slice(2)), "").pipe(
    Effect.provide(NodeFileSystem.layer)
  ),
  { disableErrorReporting: true }
);
