import { describe, expect, it } from "vitest";

import { preparedRace } from "../src/prepare-outcome.ts";
import type { PrepareOutcome } from "../src/prepare-outcome.ts";

const failedAt = (
  stage: Extract<PrepareOutcome, { readonly kind: "failed" }>["stage"]
): PrepareOutcome => ({ cause: new Error(stage), kind: "failed", stage });

describe("the race a preparation leaves", () => {
  it("has no race after a failure while dressing or building it", () => {
    expect([
      preparedRace(failedAt("dress")),
      preparedRace(failedAt("build")),
    ]).toStrictEqual(["missing", "missing"]);
  });

  it("keeps the race after a failure while compiling or warming it", () => {
    expect([
      preparedRace(failedAt("compile")),
      preparedRace(failedAt("warm")),
    ]).toStrictEqual(["built", "built"]);
  });

  it("keeps the race when the programs are ready, time out or lose the context", () => {
    expect([
      preparedRace({ kind: "ready" }),
      preparedRace({ kind: "timedOut" }),
      preparedRace({ kind: "lost" }),
    ]).toStrictEqual(["built", "built", "built"]);
  });

  it("decides nothing for a preparation that a newer one replaced", () => {
    expect(preparedRace({ kind: "cancelled" })).toBe("cancelled");
  });
});
