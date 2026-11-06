import { describe, expect, it } from "vitest";

import { SEAT_LEFT, SEAT_SILENT } from "../src/messages.ts";
import {
  advanceHearing,
  AWAY_MS,
  lastLobby,
  readyAll,
  room,
} from "./host-harness.ts";

const ABNORMAL_CLOSE = 1006;

describe("RoomLifecycle.tla counterexamples on the real host", () => {
  it("frees the spot of a rider whose browser closed the seat before it opened", () => {
    const { connecting, host, seated } = room();
    const other = seated("other", "Bo");
    const leaver = connecting("leaver", "Ann");
    expect(lastLobby(other).members).toHaveLength(2);
    host.gone(leaver, ABNORMAL_CLOSE);
    expect(lastLobby(other).members).toStrictEqual([
      expect.objectContaining({ here: true, name: "Bo" }),
    ]);
    readyAll(host, [other]);
    expect(host.status().phase).toBe("racing");
  });

  it("keeps the hold of a rider who had reached the room when a reconnect closes before it opens", () => {
    const { connecting, host, seated } = room();
    const other = seated("other", "Bo");
    const first = seated("rider", "Ann");
    host.gone(first, ABNORMAL_CLOSE);
    const again = connecting("rider", "Ann");
    host.gone(again, ABNORMAL_CLOSE);
    expect(lastLobby(other).members[1]).toMatchObject({
      here: false,
      name: "Ann",
    });
  });

  it("keeps a rider away when their Leave crosses the room's silence close, until the hold runs out", () => {
    const { clock, host, seated } = room();
    const other = seated("other", "Bo");
    const quiet = seated("quiet", "Ann");
    advanceHearing(host, clock, [other], 12_000);
    expect(quiet.closed).toBe(SEAT_SILENT);
    host.gone(quiet, SEAT_LEFT);
    expect(lastLobby(other).members[1]).toMatchObject({
      here: false,
      name: "Ann",
    });
    advanceHearing(host, clock, [other], AWAY_MS);
    expect(lastLobby(other).members).toHaveLength(1);
  });
});
