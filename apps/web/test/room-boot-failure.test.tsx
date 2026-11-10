import type { RoomSeat } from "@racer/rooms/seat-client";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

import { RoomLobby } from "../src/components/room-lobby.tsx";
import type { RacePlan } from "../src/game/hud.ts";
import type { RoomVisit } from "../src/navigation.ts";
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
      onMove={vi.fn<(visit: RoomVisit) => void>()}
      onPrepare={vi.fn<(plan: RacePlan) => Promise<PrepareOutcome>>()}
      onSeat={vi.fn<(seat: RoomSeat | null) => void>()}
      onStart={vi.fn<(plan: RacePlan) => void>()}
      ready={false}
      shown
      visit={{ arrival: "made", rejoin: null, roomId: ROOM_ID }}
    />
  );

describe("a room whose game failed to boot", () => {
  it("shows the rider why the game did not start instead of seating them", () => {
    const screen = roomScreen(FAILURE);
    expect(screen).toContain(`Could not start the game: ${FAILURE}`);
    expect(screen).toContain('role="alert"');
    expect(screen).toContain("Reload");
    expect(screen).toContain("Leave");
    expect(screen).not.toContain("What do they call you?");
  });

  it("seats a rider whose game booted", () => {
    const screen = roomScreen("");
    expect(screen).toContain("What do they call you?");
    expect(screen).not.toContain("Could not start the game");
  });
});
