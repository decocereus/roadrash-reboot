import type { RoomClient } from "@racer/sim/room-client";
import { createTickFrame } from "@racer/sim/room-frame";
import { createReadTick, readCatchUp, readTick } from "@racer/sim/room-wire";
import { describe, expect, it } from "vitest";

import { SEAT_QUIT } from "../src/messages.ts";
import {
  advanceHearing,
  clientOf,
  countdownsOn,
  fakeSocket,
  followTicks,
  HOLD_MS,
  lastLobby,
  nearby,
  readyAll,
  readyPacket,
  room,
  sameBuild,
  START_DELAY_MS,
  startedOf,
  TICK_MS,
} from "./host-harness.ts";
import type { Clock, FakeSocket } from "./host-harness.ts";

const AWAY_MS = 5000;
const RIDE_ON_MS = 2000;

const notesOf = (clock: Clock, ...kinds: readonly string[]) =>
  clock.notes.filter((note) => kinds.includes(note.kind));

const kindsHeard = (socket: FakeSocket): readonly string[] =>
  socket.messages.map(({ kind }) => kind);

const followAll = (socket: FakeSocket, client: RoomClient): void => {
  const read = createReadTick(createTickFrame());
  for (const packet of socket.ticks.splice(0)) {
    const part = readCatchUp(packet);
    if (part) {
      client.catchUp(part);
    } else {
      expect(readTick(packet, read)).toBeTruthy();
      client.confirm(read.frame, read.hashed ? read.hash : null);
    }
  }
};

const droppedRider = () => {
  const { clock, host, seated } = room();
  const ann = seated("ann", "Ann");
  const bo = seated("bo", "Bo");
  readyAll(host, [ann, bo]);
  host.message(ann, readyPacket(ann));
  host.message(bo, readyPacket(bo));
  clock.advance(START_DELAY_MS + TICK_MS * 10);
  const stayed = clientOf(bo);
  followTicks(bo, stayed);
  host.gone(ann, 1006);
  advanceHearing(host, clock, [bo], AWAY_MS);
  return { bo, clock, host, seated, stayed };
};

const loadingRoom = () => {
  const { clock, host, seated } = room();
  const ann = seated("ann", "Ann");
  const bo = seated("bo", "Bo");
  readyAll(host, [ann, bo]);
  return { ann, bo, clock, host, seated };
};

describe("a rider whose link drops mid-race", () => {
  it("gets the same bike back, caught up to the room's race", () => {
    const { bo, clock, host, seated, stayed } = droppedRider();
    const back = seated("ann", "Ann");
    expect(startedOf(back)).toMatchObject({ awayMs: AWAY_MS, you: 0 });
    expect(kindsHeard(back)).toStrictEqual(["started", "countdown"]);
    const caught = clientOf(back);
    followAll(back, caught);
    expect(caught.confirmed.tick).toBe(host.status().tick);
    advanceHearing(host, clock, [bo, back], RIDE_ON_MS);
    followAll(back, caught);
    followTicks(bo, stayed);
    const { riders, tick } = caught.confirmed;
    expect({ riders, tick }).toStrictEqual({
      riders: stayed.confirmed.riders,
      tick: stayed.confirmed.tick,
    });
    expect(notesOf(clock, "held", "rejoined", "left")).toMatchObject([
      { closeCode: 1006, kind: "held", rider: 0 },
      { awayMs: AWAY_MS, kind: "rejoined", rider: 0 },
    ]);
  });

  it("leaves the bike with the room once the hold runs out, and a late return waits at the bar", () => {
    const { bo, clock, host, seated } = droppedRider();
    advanceHearing(host, clock, [bo], HOLD_MS - AWAY_MS);
    const back = seated("ann", "Ann");
    expect(kindsHeard(back)).not.toContain("started");
    expect(lastLobby(back).seatHoldSeconds).toBe(HOLD_MS / 1000);
    expect(notesOf(clock, "held", "rejoined", "left")).toMatchObject([
      { kind: "held" },
      { closeCode: 1006, kind: "left" },
    ]);
  });

  it("gives the bike up at once when the rider chose the bar", () => {
    const { clock, host } = droppedRider();
    const back = fakeSocket();
    host.seat(back, "Ann", nearby, { ...sameBuild("ann"), rejoin: false });
    expect(kindsHeard(back)).not.toContain("started");
    expect(notesOf(clock, "held", "rejoined", "left")).toMatchObject([
      { kind: "held" },
      { closeCode: SEAT_QUIT, kind: "left" },
    ]);
  });
});

describe("a rider who drops and comes back", () => {
  it("keeps the frame trace from both links in one file", () => {
    const { ann, clock, host, seated } = loadingRoom();
    const trace = { build: "abc", gpu: "Test GPU", graphics: "rung 1" };
    host.message(ann, JSON.stringify({ ...trace, rows: [1, 2] }));
    host.gone(ann, 1006);
    const back = seated("ann", "Ann");
    host.message(back, JSON.stringify({ ...trace, rows: [3] }));
    host.gone(back, SEAT_QUIT);
    const saved = clock.tape.get("tapes/race-1/rider-0.trace.json");
    expect(saved).toContain('"connections":[[1,2],[3]]');
  });
});

describe("a rider whose link drops while the road loads", () => {
  it("does not hold the countdown for the others", () => {
    const { ann, bo, host, seated } = loadingRoom();
    host.message(bo, readyPacket(bo));
    expect(countdownsOn(bo)).toBe(0);
    host.gone(ann, 1006);
    expect(countdownsOn(bo)).toBe(1);
    const back = seated("ann", "Ann");
    expect(kindsHeard(back)).toStrictEqual(["started", "countdown"]);
  });

  it("loads again on return, and the countdown waits for it", () => {
    const { ann, bo, host, seated } = loadingRoom();
    host.gone(ann, 1006);
    const back = seated("ann", "Ann");
    expect(kindsHeard(back)).toStrictEqual(["started"]);
    host.message(bo, readyPacket(bo));
    expect(countdownsOn(bo)).toBe(0);
    host.message(back, readyPacket(back));
    expect([countdownsOn(bo), countdownsOn(back)]).toStrictEqual([1, 1]);
  });

  it("waits for the new load even when the rider was ready before the drop", () => {
    const { ann, bo, host, seated } = loadingRoom();
    host.message(ann, readyPacket(ann));
    host.gone(ann, 1006);
    const back = seated("ann", "Ann");
    host.message(bo, readyPacket(bo));
    expect(countdownsOn(bo)).toBe(0);
    host.message(back, readyPacket(back));
    expect(countdownsOn(bo)).toBe(1);
  });
});
