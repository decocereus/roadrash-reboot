import { describe, expect, it } from "vitest";

import { barTabs, stepNavigation } from "../src/navigation.ts";
import { LEFT, panels, walk } from "./navigation-walk.ts";

describe("the bar's tabs", () => {
  it("opens Garage and Settings from every panel and keeps the panel under them", () => {
    for (const view of panels) {
      for (const tab of barTabs) {
        expect(
          stepNavigation(view, { kind: "tabbed", tab }).state
        ).toStrictEqual({ ...view, tab });
      }
    }
  });

  it("opens the Garage from the stand from every panel, and Esc puts the panel back", () => {
    for (const view of panels) {
      const walked = walk(view, { kind: "walkedUp", spot: "garage" });
      expect(walked.at).toStrictEqual({ ...view, tab: "garage" });
      expect(walked.effects).toStrictEqual([]);
      expect(walk(walked.at, LEFT).at).toStrictEqual(view);
    }
  });

  it("opens the Garage from the stand the same as the Garage tab", () => {
    for (const view of panels) {
      for (const tab of barTabs) {
        expect(
          stepNavigation({ ...view, tab }, { kind: "walkedUp", spot: "garage" })
            .state
        ).toStrictEqual(
          stepNavigation({ ...view, tab }, { kind: "tabbed", tab: "garage" })
            .state
        );
      }
    }
  });

  it("leaves Garage or Settings for the Race tab with the panel as it was", () => {
    for (const view of panels) {
      for (const tab of ["garage", "settings"] as const) {
        expect(walk({ ...view, tab }, LEFT).at).toStrictEqual(view);
      }
    }
  });
});
