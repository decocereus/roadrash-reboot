import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, describe, expect, it, vi } from "vitest";

import { RoomLobby } from "../src/components/room-lobby.tsx";
import type { RacePlan } from "../src/game/hud.ts";
import type { PrepareOutcome } from "../src/prepare-outcome.ts";

const ROOM_ID = "abcd1234";
const FAILURE = "The model /art/bike.glb answered 404.";

const roomScreen = (failure: string): string =>
  renderToStaticMarkup(
    <RoomLobby
      failure={failure}
      onBack={vi.fn<() => void>()}
      onDoorMoment={vi.fn<(atDoor: boolean) => void>()}
      onLost={vi.fn<() => void>()}
      onPrepare={vi.fn<(plan: RacePlan) => Promise<PrepareOutcome>>()}
      onStart={vi.fn<(plan: RacePlan) => void>()}
      ready={false}
      roomId={ROOM_ID}
    />
  );

describe("a room whose game failed to boot", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("shows the rider why the game did not start instead of seating them", () => {
    vi.stubGlobal("location", { search: `?room=${ROOM_ID}&via=made` });
    const screen = roomScreen(FAILURE);
    expect(screen).toContain(`Could not start the game: ${FAILURE}`);
    expect(screen).toContain('role="alert"');
    expect(screen).toContain("Reload");
    expect(screen).toContain("Leave");
    expect(screen).not.toContain("What do they call you?");
  });

  it("seats a rider whose game booted", () => {
    vi.stubGlobal("location", { search: `?room=${ROOM_ID}&via=made` });
    const screen = roomScreen("");
    expect(screen).toContain("What do they call you?");
    expect(screen).not.toContain("Could not start the game");
  });
});
