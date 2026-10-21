import * as NodeChildProcessSpawner from "@effect/platform-node/NodeChildProcessSpawner";
import * as NodeFileSystem from "@effect/platform-node/NodeFileSystem";
import * as NodeHttpClient from "@effect/platform-node/NodeHttpClient";
import * as NodePath from "@effect/platform-node/NodePath";
import * as NodeRuntime from "@effect/platform-node/NodeRuntime";
import * as NodeSocket from "@effect/platform-node/NodeSocket";
import { DetachedProcesses } from "@racer/devtools/node/detached-process";
import { ToolProcesses } from "@racer/devtools/process";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";

import { main } from "./src/cli.ts";
import { Evidence } from "./src/evidence.ts";
import { SlotStore } from "./src/state.ts";

const SCRIPT = import.meta.filename;

const processes = ToolProcesses.layer.pipe(
  Layer.provide(DetachedProcesses.layer),
  Layer.provide(NodeChildProcessSpawner.layer)
);

const services = Layer.mergeAll(SlotStore.layer, Evidence.layer).pipe(
  Layer.provideMerge(
    Layer.mergeAll(
      processes,
      NodeHttpClient.layerUndici,
      NodeSocket.layerWebSocketConstructor
    )
  ),
  Layer.provideMerge(Layer.mergeAll(NodeFileSystem.layer, NodePath.layer))
);

NodeRuntime.runMain(main(SCRIPT).pipe(Effect.provide(services)), {
  disableErrorReporting: true,
});
