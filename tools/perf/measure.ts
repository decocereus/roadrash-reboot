import * as NodeChildProcessSpawner from "@effect/platform-node/NodeChildProcessSpawner";
import * as NodeFileSystem from "@effect/platform-node/NodeFileSystem";
import * as NodeHttpClient from "@effect/platform-node/NodeHttpClient";
import * as NodePath from "@effect/platform-node/NodePath";
import * as NodeRuntime from "@effect/platform-node/NodeRuntime";
import * as NodeSocket from "@effect/platform-node/NodeSocket";
import { runCommand } from "@racer/devtools/cleanup";
import { ToolProcesses } from "@racer/devtools/process";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";

import { readOptions } from "./src/measure-options.ts";
import { main } from "./src/measure.ts";

const options = readOptions();

const services = Layer.mergeAll(
  ToolProcesses.layer.pipe(Layer.provide(NodeChildProcessSpawner.layer)),
  NodeHttpClient.layerUndici,
  NodeSocket.layerWebSocketConstructor
).pipe(
  Layer.provideMerge(Layer.mergeAll(NodeFileSystem.layer, NodePath.layer))
);

NodeRuntime.runMain(
  runCommand(main(options), "").pipe(Effect.provide(services)),
  { disableErrorReporting: true }
);
