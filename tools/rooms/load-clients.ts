import * as NodeRuntime from "@effect/platform-node/NodeRuntime";

import { clientsMain } from "./src/load-clients.ts";

NodeRuntime.runMain(clientsMain(process.argv[2] ?? ""), {
  disableErrorReporting: false,
});
