import { launchRoomConfig } from "@racer/rooms/room-config";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

import {
  QueueScreen,
  RoomLobbyScreen,
} from "../src/components/screens/room-lobby.tsx";

const LIMITED =
  "Too many riders joined from your network. Try again in a minute.";

describe("a rider the rooms Worker refused for joining too often", () => {
  it("reads why on the room screen and is offered Back, not Reload", () => {
    const screen = renderToStaticMarkup(
      <RoomLobbyScreen
        name="Rider"
        onBack={vi.fn<() => void>()}
        phase="refused"
        refusal="limited"
        roomId="abcd1234"
      />
    );
    expect(screen).toContain(LIMITED);
    expect(screen).not.toContain("Reload");
  });

  it("reads why on the queue screen instead of a rider count", () => {
    const screen = renderToStaticMarkup(
      <QueueScreen
        onBack={vi.fn<() => void>()}
        refusal="limited"
        riders={1}
        waitSeconds={launchRoomConfig.queueWaitSeconds}
      />
    );
    expect(screen).toContain(LIMITED);
    expect(screen).not.toContain("Reload");
    expect(screen).not.toContain("1 of");
  });

  it("still sends a rider on an old build to Reload from the queue", () => {
    const screen = renderToStaticMarkup(
      <QueueScreen
        onBack={vi.fn<() => void>()}
        refusal="build"
        riders={1}
        waitSeconds={launchRoomConfig.queueWaitSeconds}
      />
    );
    expect(screen).toContain("The game has updated. Reload to join.");
    expect(screen).toContain("Reload");
  });
});
