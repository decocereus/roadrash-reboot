import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

import { BackRoomScreen } from "../src/components/screens/back-room.tsx";

const FAILURE = "Getting the race ready took too long. Try again.";

describe("the Back Room after the race rules failed to load", () => {
  it("tells the rider why and offers only Try again", () => {
    const screen = renderToStaticMarkup(
      <BackRoomScreen
        failure={FAILURE}
        onContinue={vi.fn<() => void>()}
        onNewCareer={vi.fn<() => void>()}
        onQuickRace={vi.fn<() => void>()}
        onStartOver={vi.fn<() => void>()}
        save={{ status: "loading" }}
      />
    );
    const buttons = screen
      .split("<button")
      .slice(1)
      .map(
        (button) =>
          /Try again|Career|Start over|Single race|Settings/u.exec(
            button.slice(0, button.indexOf("</button>"))
          )?.[0] ?? ""
      );
    expect(screen).toContain(`Could not start the game: ${FAILURE}`);
    expect(buttons).toStrictEqual(["Try again"]);
  });
});
