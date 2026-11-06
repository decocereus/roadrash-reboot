import { describe, expect, it } from "vitest";

import { SEAT_LEFT } from "../src/messages.ts";
import { advanceHearing, AWAY_MS, lastLobby, room } from "./host-harness.ts";

describe("a rider who presses Leave", () => {
  it("is gone from the lobby at once, and the room makes the next rider host", () => {
    const { host, seated } = room();
    const leaver = seated("leaver", "Ann");
    const other = seated("other", "Bo");
    host.gone(leaver, SEAT_LEFT);
    expect(lastLobby(other)).toMatchObject({
      hostId: "m2",
      members: [{ here: true, id: "m2", name: "Bo" }],
    });
    expect(lastLobby(other).members).toHaveLength(1);
  });

  it("comes back as a new member", () => {
    const { host, seated } = room();
    const leaver = seated("leaver", "Ann");
    seated("other", "Bo");
    host.gone(leaver, SEAT_LEFT);
    const back = seated("leaver", "Ann");
    expect(lastLobby(back)).toMatchObject({
      members: [{ id: "m2" }, { id: "m3" }],
      you: "m3",
    });
  });

  it("is told apart from a drop, which keeps the member away until the window ends", () => {
    const { clock, host, seated } = room();
    const dropped = seated("dropped", "Ann");
    const other = seated("other", "Bo");
    host.gone(dropped, 1006);
    advanceHearing(host, clock, [other], AWAY_MS - 2000);
    expect(lastLobby(other).members[0]).toMatchObject({
      here: false,
      id: "m1",
    });
    const back = seated("dropped", "Ann");
    expect(lastLobby(back).you).toBe("m1");
    expect(lastLobby(other).members[0]).toMatchObject({ here: true, id: "m1" });
  });
});
