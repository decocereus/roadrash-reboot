import { describe, expect, it } from "vitest";

import { SEAT_LEFT, SEAT_QUIT, SEAT_SILENT } from "../src/messages.ts";
import {
  advanceHearing,
  AWAY_MS,
  HOLD_MS,
  lastLobby,
  readyAll,
  readyPacket,
  room,
  START_DELAY_MS,
  startedOf,
  TICK_MS,
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

  it("keeps the hold and the bike of a racer whose rejoin closed before it opened", () => {
    const { clock, connecting, host, seated } = room();
    const ann = seated("ann", "Ann");
    const bo = seated("bo", "Bo");
    readyAll(host, [ann, bo]);
    host.message(ann, readyPacket(ann));
    host.message(bo, readyPacket(bo));
    clock.advance(START_DELAY_MS + TICK_MS * 10);
    const cy = seated("cy", "Cy");
    host.gone(ann, ABNORMAL_CLOSE);
    host.gone(connecting("ann", "Ann"), ABNORMAL_CLOSE);
    expect(lastLobby(cy).members).toContainEqual(
      expect.objectContaining({ here: false, name: "Ann" })
    );
    expect(startedOf(seated("ann", "Ann"))).toMatchObject({ you: 0 });
    expect(
      clock.notes
        .filter(({ kind }) => ["held", "left", "rejoined"].includes(kind))
        .map(({ kind }) => kind)
    ).toStrictEqual(["held", "rejoined", "held", "rejoined"]);
  });

  it("lets a hold that ran out go when the rider is back before the hold's timer wakes", () => {
    const { clock, host, seated } = room();
    const ann = seated("ann", "Ann");
    const bo = seated("bo", "Bo");
    readyAll(host, [ann, bo]);
    host.message(ann, readyPacket(ann));
    host.message(bo, readyPacket(bo));
    clock.advance(START_DELAY_MS + TICK_MS * 10);
    host.gone(ann, ABNORMAL_CLOSE);
    advanceHearing(host, clock, [bo], HOLD_MS - 1000);
    clock.stall(2000);
    const back = seated("ann", "Ann");
    expect(back.messages.map(({ kind }) => kind)).not.toContain("started");
    clock.advance(1000);
    expect(
      clock.notes
        .filter(({ kind }) => ["held", "left", "rejoined"].includes(kind))
        .map((note) => [note.kind, "closeCode" in note ? note.closeCode : null])
    ).toStrictEqual([
      ["held", ABNORMAL_CLOSE],
      ["left", ABNORMAL_CLOSE],
    ]);
  });

  it("known defect lateQuitRejoins: puts a racer whose failed preparation quit back on the bike when the new page's seat beats the quit", () => {
    const { clock, host, seated } = room();
    const ann = seated("ann", "Ann");
    const bo = seated("bo", "Bo");
    readyAll(host, [ann, bo]);
    const again = seated("ann", "Ann");
    host.gone(ann, SEAT_QUIT);
    expect(startedOf(again)).toMatchObject({ you: 0 });
    expect(
      clock.notes
        .filter(({ kind }) => ["held", "left", "rejoined"].includes(kind))
        .map(({ kind }) => kind)
    ).toStrictEqual(["held", "rejoined"]);
  });
});
