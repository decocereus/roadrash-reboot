import * as NodeRuntime from "@effect/platform-node/NodeRuntime";

import { main } from "./src/gate.ts";

NodeRuntime.runMain(main(process.argv.slice(2)), {
  disableErrorReporting: false,
});
