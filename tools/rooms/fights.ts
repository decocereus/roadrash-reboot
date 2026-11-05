import * as NodeChildProcessSpawner from "@effect/platform-node/NodeChildProcessSpawner";
import * as NodeFileSystem from "@effect/platform-node/NodeFileSystem";
import * as NodePath from "@effect/platform-node/NodePath";
import * as NodeRuntime from "@effect/platform-node/NodeRuntime";
import { ToolProcesses } from "@racer/devtools/process";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";

import { main } from "./src/fights.ts";

const services = ToolProcesses.layer.pipe(
  Layer.provide(NodeChildProcessSpawner.layer),
  Layer.provideMerge(Layer.mergeAll(NodeFileSystem.layer, NodePath.layer))
);

NodeRuntime.runMain(
  main(process.argv.slice(2)).pipe(Effect.provide(services)),
  { disableErrorReporting: false }
);
