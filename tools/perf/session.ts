import * as NodeFileSystem from "@effect/platform-node/NodeFileSystem";
import * as NodeRuntime from "@effect/platform-node/NodeRuntime";
import { runCommand } from "@racer/devtools/cleanup";
import * as Effect from "effect/Effect";

import { main, readOptions } from "./src/session.ts";

const options = readOptions();

NodeRuntime.runMain(
  runCommand(main(options), "").pipe(Effect.provide(NodeFileSystem.layer)),
  { disableErrorReporting: true }
);
