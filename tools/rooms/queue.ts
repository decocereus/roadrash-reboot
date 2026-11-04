import * as NodeRuntime from "@effect/platform-node/NodeRuntime";

import { main } from "./src/queue.ts";

NodeRuntime.runMain(main(process.argv.slice(2)), {
  disableErrorReporting: false,
});
