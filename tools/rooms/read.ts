import * as NodeFileSystem from "@effect/platform-node/NodeFileSystem";
import * as NodeRuntime from "@effect/platform-node/NodeRuntime";
import * as Effect from "effect/Effect";
import * as FetchHttpClient from "effect/http/FetchHttpClient";
import * as Layer from "effect/Layer";

import { main } from "./src/read.ts";

NodeRuntime.runMain(
  main(process.argv.slice(2)).pipe(
    Effect.provide(Layer.merge(FetchHttpClient.layer, NodeFileSystem.layer))
  ),
  { disableErrorReporting: false }
);
