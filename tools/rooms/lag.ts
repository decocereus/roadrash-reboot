import * as NodeRuntime from "@effect/platform-node/NodeRuntime";

import { main } from "./src/lag.ts";

NodeRuntime.runMain(main(process.argv.slice(2)), {
  disableErrorReporting: false,
});
