import { describe, expect, it } from "vitest";

import { forecastCosts } from "./pilot-forecast.ts";

describe("the pilot's forecast costs", () => {
  it("never pay a line for meeting something, so a line that cannot win before its forecast cannot win after it", () => {
    const negative = Object.entries(forecastCosts).filter(
      ([, cost]) => !(cost >= 0)
    );
    expect(negative).toStrictEqual([]);
  });
});
