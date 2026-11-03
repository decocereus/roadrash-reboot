import path from "node:path";

import { dropClaim, takeClaim, toolStateDir } from "@racer/devtools/claim";
import { released } from "@racer/devtools/cleanup";
import * as Effect from "effect/Effect";

import { MeasurementFailed } from "./measurement-failed.ts";

const claimed = Effect.fnUntraced(function* claimed(
  file: string,
  label: string
) {
  const outcome = yield* takeClaim(file, label);
  if (outcome.kind === "held") {
    yield* new MeasurementFailed({
      lane: "gpu",
      message: `Another bench is using this GPU: pid ${outcome.holder.pid}, ${outcome.holder.label}. Two benches on one GPU skew each other, so wait for it. Claim: ${file}`,
    });
  }
});

export const holdBench = (label: string, dir: string = toolStateDir) => {
  const file = path.join(dir, "bench.lock");
  return Effect.acquireRelease(claimed(file, label), () =>
    released(dropClaim(file))
  );
};
