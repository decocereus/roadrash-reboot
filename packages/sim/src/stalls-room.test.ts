import { trackFor } from "@racer/track/roads";
import { describe, expect, it } from "vitest";

import { controlOf } from "./control.ts";
import { riderAt, ROOM_LIMIT_TICKS } from "./race-fixtures.ts";
import { neutralInput, defaultSetup } from "./race.ts";
import { createRoomClient } from "./room-client.ts";
import { createScratch, scratchFor } from "./room-frame.ts";
import { createRoom, roomSetup } from "./room.ts";
import { HASH_WORDS } from "./snapshot-bytes.ts";
import { setupDigest } from "./snapshot-setup.ts";
import { hashRace } from "./snapshot.ts";
import { PLAYER_RIDER, riderIdAt } from "./state.ts";
import type { Control, RaceState, RiderId } from "./state.ts";

const road = trackFor("breakwater-run");
const RIVAL = riderIdAt(1);
const SEATS = [PLAYER_RIDER, RIVAL] as const;
const INTO_THE_MARKET = 1800;
const RACE_TICKS = 4000;
const LEAD_TICKS = 6;
const SWERVE_TICKS = 150;
const NEAR_A_STALL = 2;
const ROOM_RACE_TIMEOUT_MS = 120_000;

const swerving =
  (firstSteer: 1 | -1) =>
  (tick: number): Control => {
    const swerve =
      Math.floor(tick / SWERVE_TICKS) % 2 === 0 ? firstSteer : -firstSteer;
    return controlOf({
      ...neutralInput,
      remount: true,
      steer: tick < INTO_THE_MARKET ? 0 : swerve,
      throttle: 1,
    });
  };

const hostRides = swerving(1);
const guestRides = swerving(-1);

const hashOf = (state: RaceState): readonly number[] => {
  const hash = new Uint32Array(HASH_WORDS);
  hashRace(
    state,
    setupDigest(state, road),
    scratchFor(createScratch(state), state),
    hash
  );
  return [...hash];
};

const atStall = (rider: RiderId, state: RaceState): boolean => {
  const { s, x } = riderAt(state, rider);
  return road.stalls.some(
    (stall) =>
      Math.abs(s - stall.s) < stall.halfLength + NEAR_A_STALL &&
      Math.abs(x - stall.x) < stall.halfWidth + NEAR_A_STALL
  );
};

const race = () => {
  const setup = roomSetup(defaultSetup(road, 7), [...SEATS]);
  const room = createRoom(setup, ROOM_LIMIT_TICKS);
  const host = createRoomClient(setup, PLAYER_RIDER, ROOM_LIMIT_TICKS);
  const guest = createRoomClient(setup, RIVAL, ROOM_LIMIT_TICKS);
  const hashes: (readonly number[])[] = [];
  let stallCrashes = 0;
  const predictUpTo = (tick: number): void => {
    host.predict(hostRides(tick));
    guest.predict(guestRides(tick));
  };
  for (let tick = 1; tick <= LEAD_TICKS; tick += 1) {
    predictUpTo(tick);
  }
  for (let tick = 1; tick <= RACE_TICKS; tick += 1) {
    room.accept(PLAYER_RIDER, tick, [hostRides(tick)]);
    room.accept(RIVAL, tick, [guestRides(tick)]);
    room.step();
    for (const event of room.state.events) {
      if (
        event.kind === "crash" &&
        event.cause === "prop" &&
        atStall(event.rider, room.state)
      ) {
        stallCrashes += 1;
      }
    }
    const hash = room.hashed ? room.hash : null;
    if (hash) {
      hashes.push([...hash]);
    }
    host.confirm(room.frame, hash);
    guest.confirm(room.frame, hash);
    predictUpTo(tick + LEAD_TICKS);
  }
  return { guest, hashes, host, room, stallCrashes };
};

describe("a room race through Breakwater Run's market", () => {
  it(
    "crashes riders into stalls with no pacing, and both clients and a second run of the same controls end on the room's race, hash for hash",
    () => {
      const first = race();
      const { guest, host, room } = first;
      expect(room.state.pacing).toStrictEqual({ catchUp: 0, leadEase: 0 });
      expect(first.stallCrashes).toBeGreaterThan(0);
      expect([host.stats.desyncs, guest.stats.desyncs]).toStrictEqual([0, 0]);
      expect([hashOf(host.confirmed), hashOf(guest.confirmed)]).toStrictEqual([
        hashOf(room.state),
        hashOf(room.state),
      ]);
      expect(race().hashes).toStrictEqual(first.hashes);
    },
    ROOM_RACE_TIMEOUT_MS
  );
});
