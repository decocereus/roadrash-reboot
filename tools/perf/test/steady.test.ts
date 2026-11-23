import * as Effect from "effect/Effect";
import * as Exit from "effect/Exit";
import { describe, expect, it } from "vitest";

import {
  MAX_WARM_WINDOWS,
  settleWindows,
  STEADY_TOLERANCE,
} from "../src/node.ts";

const scenario = { id: "synthetic-v1" };

const windowsOf = (means: readonly number[]) => {
  let timed = 0;
  return {
    timed: () => timed,
    window: () => {
      const mean = means[Math.min(timed, means.length - 1)] ?? Number.NaN;
      timed += 1;
      return [mean];
    },
  };
};

describe(settleWindows, () => {
  it("stops at the first two windows whose means agree", async () => {
    const within = 1 + STEADY_TOLERANCE / 2;
    const { timed, window } = windowsOf([3, 1.6, within, 1]);
    const warmup = await Effect.runPromise(settleWindows(scenario, window));
    expect(warmup.map((each) => each.mean)).toStrictEqual([3, 1.6, within, 1]);
    expect(timed()).toBe(4);
  });

  it("fails with WarmUpUnsettled at the cap instead of timing an unsettled run", async () => {
    const apart = 1 + STEADY_TOLERANCE * 2;
    const { timed, window } = windowsOf(
      Array.from({ length: MAX_WARM_WINDOWS }, (_, index) =>
        index % 2 === 0 ? 1 : apart
      )
    );
    const exit = await Effect.runPromiseExit(settleWindows(scenario, window));
    expect(Exit.isFailure(exit)).toBeTruthy();
    expect(String(exit)).toContain("WarmUpUnsettled");
    expect(String(exit)).toContain(
      `synthetic-v1 did not settle in ${MAX_WARM_WINDOWS} warm windows`
    );
    expect(timed()).toBe(MAX_WARM_WINDOWS);
  });
});
