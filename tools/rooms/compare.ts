import * as NodeFileSystem from "@effect/platform-node/NodeFileSystem";
import * as NodeRuntime from "@effect/platform-node/NodeRuntime";
import * as Effect from "effect/Effect";

import { main } from "./src/fight-compare.ts";

NodeRuntime.runMain(
  main(process.argv.slice(2)).pipe(Effect.provide(NodeFileSystem.layer)),
  { disableErrorReporting: false }
);
