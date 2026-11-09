import { describe, expect, it } from "vitest";

import { controlOf } from "./control.ts";
import { ROOM_LIMIT_TICKS, track } from "./race-fixtures.ts";
import { defaultSetup, neutralInput } from "./race.ts";
import { hexOfWords } from "./room-tape.ts";
import { createRoom, firstRacers, roomSetup, seatsCapacity } from "./room.ts";
import type { Room } from "./room.ts";
import { restoreInto, snapshotCapacity, writeSnapshot } from "./snapshot.ts";
import type { RiderId } from "./state.ts";

const CHECKPOINT_TICK = 300;
const QUIET_FROM_TICK = 291;
const QUEUED_AHEAD = 10;
const RIDE_ON_TICKS = 100;

const steerAt = (tick: number) =>
  controlOf({
    ...neutralInput,
    steer: tick % 40 < 20 ? 0.3 : -0.3,
    throttle: 1,
  });

const twoSeats = () => {
  const base = defaultSetup(track, 3);
  const humans = firstRacers(base, 2);
  const [driver, passenger] = humans;
  if (driver === undefined || passenger === undefined) {
    throw new Error("The fixture seats two humans.");
  }
  return { driver, passenger, setup: roomSetup(base, humans) };
};

const feed = (room: Room, rider: RiderId, tick: number): void => {
  room.accept(rider, tick, [steerAt(tick)]);
};

const checkpointed = () => {
  const { driver, passenger, setup } = twoSeats();
  const room = createRoom(setup, ROOM_LIMIT_TICKS);
  for (let tick = 1; tick <= CHECKPOINT_TICK; tick += 1) {
    feed(room, driver, tick);
    if (tick < QUIET_FROM_TICK) {
      feed(room, passenger, tick);
    }
    room.step();
  }
  for (let ahead = 1; ahead <= QUEUED_AHEAD; ahead += 1) {
    feed(room, driver, CHECKPOINT_TICK + ahead);
  }
  const snapshot = new DataView(new ArrayBuffer(snapshotCapacity(room.state)));
  writeSnapshot(room.state, room.digest, snapshot);
  const seats = new DataView(new ArrayBuffer(seatsCapacity(2)));
  const written = room.writeSeats(seats);
  return { driver, passenger, room, seats, setup, snapshot, written };
};

describe("a room restored from its checkpoint", () => {
  it("steps on as the uninterrupted room would, riding the controls it already held", () => {
    const { driver, room, seats, setup, snapshot, written } = checkpointed();
    expect(written).toBe(seatsCapacity(2));
    const restored = createRoom(setup, ROOM_LIMIT_TICKS);
    restoreInto(restored.state, restored.digest, snapshot, setup.track);
    restored.readSeats(seats);
    for (
      let tick = CHECKPOINT_TICK + 1;
      tick <= CHECKPOINT_TICK + RIDE_ON_TICKS;
      tick += 1
    ) {
      if (tick > CHECKPOINT_TICK + QUEUED_AHEAD) {
        feed(room, driver, tick);
        feed(restored, driver, tick);
      }
      room.step();
      restored.step();
      expect(restored.frame.controls.get(driver)).toBe(
        room.frame.controls.get(driver)
      );
      expect(hexOfWords(restored.hashNow())).toBe(hexOfWords(room.hashNow()));
    }
    expect(room.frame.controls.get(driver)).toBe(
      steerAt(CHECKPOINT_TICK + RIDE_ON_TICKS)
    );
  });

  it("refuses the seat record of another room", () => {
    const { seats, setup } = checkpointed();
    const other = createRoom(
      roomSetup(defaultSetup(track, 3), firstRacers(defaultSetup(track, 3), 1)),
      ROOM_LIMIT_TICKS
    );
    expect(() => {
      other.readSeats(seats);
    }).toThrow(RangeError);
    expect(setup.rivals.length).toBeGreaterThan(0);
  });
});
