import { HASH_EVERY } from "@racer/sim/room";
import {
  MOST_REPAIRS,
  readRaceSnapshot,
  REPAIR_PACKET_BYTES,
  writeRepair,
} from "@racer/sim/room-wire";
import { riderIdAt, riderOf } from "@racer/sim/state";
import { describe, expect, it } from "vitest";

import { createHost } from "../src/host.ts";
import { REPAIR_EVERY_TICKS } from "../src/race-seat.ts";
import {
  advanceHearing,
  clientOf,
  createClock,
  fakeSocket,
  followTicks,
  nearby,
  pingPacket,
  readyAll,
  readyPacket,
  room,
  sameBuild,
  START_DELAY_MS,
  TICK_MS,
} from "./host-harness.ts";
import type { Clock, FakeSocket } from "./host-harness.ts";

const REPAIR_EVERY_MS = REPAIR_EVERY_TICKS * TICK_MS;

const askFor = (tick: number): ArrayBuffer => {
  const buffer = new ArrayBuffer(REPAIR_PACKET_BYTES);
  writeRepair(new DataView(buffer), tick);
  return buffer;
};

const snapshotsOn = (socket: FakeSocket): number =>
  socket.ticks.filter((packet) => readRaceSnapshot(packet) !== null).length;

const repairNotes = (clock: Clock) =>
  clock.notes.filter((note) => note.kind === "repaired");

const racing = () => {
  const { clock, host, seated } = room();
  const ann = seated("ann", "Ann");
  const bo = seated("bo", "Bo");
  readyAll(host, [ann, bo]);
  host.message(ann, readyPacket(ann));
  host.message(bo, readyPacket(bo));
  clock.advance(START_DELAY_MS);
  advanceHearing(host, clock, [ann, bo], 2000);
  return { ann, bo, clock, host };
};

describe("a rider whose race drifts from the room's", () => {
  it("asks once and is back on the room's hash after the one snapshot the room sends", () => {
    const { ann, bo, clock, host } = racing();
    const client = clientOf(ann);
    followTicks(ann, client);
    const rival = riderOf(client.confirmed.riders, riderIdAt(1));
    if (rival) {
      rival.s += 1;
    }
    advanceHearing(host, clock, [ann, bo], 1000);
    followTicks(ann, client);
    const { desyncs } = client.stats;
    const ask = new DataView(new ArrayBuffer(REPAIR_PACKET_BYTES));
    expect(client.writeRepair(ask)).toBe(REPAIR_PACKET_BYTES);
    host.message(ann, ask.buffer);
    expect([snapshotsOn(ann), snapshotsOn(bo)]).toStrictEqual([1, 0]);
    followTicks(ann, client);
    advanceHearing(host, clock, [ann, bo], 3000);
    followTicks(ann, client);
    expect(desyncs).toBeGreaterThan(0);
    expect({
      desyncs: client.stats.desyncs,
      repairs: client.stats.repairs,
      tick: client.confirmed.tick,
    }).toStrictEqual({ desyncs, repairs: 1, tick: host.status().tick });
    expect(repairNotes(clock)).toMatchObject([
      { desyncTick: HASH_EVERY * 3, kind: "repaired", repairs: 1, rider: 0 },
    ]);
  });

  it(`answers a seat at most once each ${REPAIR_EVERY_TICKS} ticks and ${MOST_REPAIRS} times a race`, () => {
    const { ann, bo, clock, host } = racing();
    const answered = (): number => {
      host.message(ann, askFor(HASH_EVERY));
      return snapshotsOn(ann);
    };
    expect([answered(), answered()]).toStrictEqual([1, 1]);
    advanceHearing(host, clock, [ann, bo], REPAIR_EVERY_MS - 1000);
    expect(answered()).toBe(1);
    advanceHearing(host, clock, [ann, bo], 1000);
    expect(answered()).toBe(2);
    for (let wait = 0; wait < MOST_REPAIRS; wait += 1) {
      advanceHearing(host, clock, [ann, bo], REPAIR_EVERY_MS);
      answered();
    }
    expect({
      dropped: host.status().dropped,
      notes: repairNotes(clock).map((note) => note.repairs),
      snapshots: snapshotsOn(ann),
    }).toStrictEqual({
      dropped: 0,
      notes: [1, 2, 3],
      snapshots: MOST_REPAIRS,
    });
  });

  it("ignores an ask for a tick the room never hashed or has not reached", () => {
    const { ann, clock, host } = racing();
    host.message(ann, askFor(HASH_EVERY + 1));
    host.message(ann, askFor(HASH_EVERY * 1000));
    expect({
      notes: repairNotes(clock),
      snapshots: snapshotsOn(ann),
    }).toStrictEqual({ notes: [], snapshots: 0 });
    host.message(ann, askFor(HASH_EVERY));
    expect(snapshotsOn(ann)).toBe(1);
  });

  it("keeps a seat's repairs when the room restarts from its checkpoint", () => {
    const { ann, bo, clock, host } = racing();
    for (let repair = 0; repair < MOST_REPAIRS; repair += 1) {
      host.message(ann, askFor(HASH_EVERY));
      advanceHearing(host, clock, [ann, bo], REPAIR_EVERY_MS);
    }
    const later = createClock(clock.now() + 1000);
    const restarted = createHost(later, "custom", clock.memories.at(-1));
    const back = fakeSocket();
    restarted.seat(back, "Ann", nearby, sameBuild("ann"));
    restarted.message(back, pingPacket());
    advanceHearing(restarted, later, [back], REPAIR_EVERY_MS);
    restarted.message(back, askFor(HASH_EVERY));
    expect({
      notes: repairNotes(later),
      restored: later.notes.filter((note) => note.kind === "restored").length,
      snapshots: snapshotsOn(back),
    }).toStrictEqual({ notes: [], restored: 1, snapshots: 1 });
  });
});
