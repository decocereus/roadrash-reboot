import type { PracticePick } from "@racer/career/field";
import type { RoadId } from "@racer/career/tables";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

import { firstQuickPick } from "../src/career/flow.ts";
import { HomePanel, SoloPanel } from "../src/components/screens/race-panel.tsx";

const FAILURE = "Getting the race ready took too long. Try again.";

const buttonsOf = (markup: string): readonly string[] =>
  markup
    .split("<button")
    .slice(1)
    .map(
      (button) =>
        /Try again|Ride|Start over|Race|New career|Back/u.exec(
          button.slice(0, button.indexOf("</button>"))
        )?.[0] ?? ""
    );

describe("the bar after the race rules failed to load", () => {
  it("tells the rider why on Ride solo and offers only Try again and Back", () => {
    const panel = renderToStaticMarkup(
      <SoloPanel
        failure={FAILURE}
        onBack={vi.fn<() => void>()}
        onNewCareer={vi.fn<() => void>()}
        onPick={vi.fn<(pick: PracticePick) => void>()}
        onRace={vi.fn<(roadId: RoadId) => void>()}
        onRide={vi.fn<(roadId: RoadId) => void>()}
        onStartOver={vi.fn<() => void>()}
        pick={firstQuickPick}
        rules={null}
        save={{ status: "loading" }}
      />
    );
    expect(panel).toContain(`Could not start the game: ${FAILURE}`);
    expect(buttonsOf(panel)).toStrictEqual(["Try again", "Back"]);
  });

  it("tells the rider why at home too", () => {
    const panel = renderToStaticMarkup(
      <HomePanel
        failure={FAILURE}
        onFind={vi.fn<() => void>()}
        onFriends={vi.fn<() => void>()}
        onSolo={vi.fn<() => void>()}
        rules={null}
        save={{ status: "loading" }}
      />
    );
    expect(panel).toContain(`Could not start the game: ${FAILURE}`);
    expect(panel).toContain('role="alert"');
  });
});
