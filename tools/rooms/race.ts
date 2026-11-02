import * as NodeRuntime from "@effect/platform-node/NodeRuntime";
import * as Effect from "effect/Effect";
import * as FetchHttpClient from "effect/http/FetchHttpClient";

import { main } from "./src/race.ts";

NodeRuntime.runMain(
  main(process.argv.slice(2)).pipe(Effect.provide(FetchHttpClient.layer)),
  { disableErrorReporting: false }
);
