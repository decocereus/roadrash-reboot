import { describe, expect, it } from "vitest";

import { controlOf } from "./control.ts";
import { ROOM_LIMIT_TICKS, track } from "./race-fixtures.ts";
import { defaultSetup, neutralInput } from "./race.ts";
import { createRoom, roomSetup } from "./room.ts";
import { PLAYER_RIDER, riderOf } from "./state.ts";

describe("a room's missed controls", () => {
  it("counts a tick ridden with no control once, however many late copies arrive", () => {
    const room = createRoom(
      roomSetup(defaultSetup(track, 3), [PLAYER_RIDER]),
      ROOM_LIMIT_TICKS
    );
    const full = controlOf({ ...neutralInput, throttle: 1 });
    room.step();
    room.step();
    room.accept(PLAYER_RIDER, 1, [full, full]);
    room.accept(PLAYER_RIDER, 1, [full, full]);
    expect(room.missedControls(PLAYER_RIDER)).toBe(2);
    room.accept(PLAYER_RIDER, 3, [full]);
    room.step();
    expect(room.missedControls(PLAYER_RIDER)).toBe(2);
    expect(room.acceptance.late).toBe(0);
  });

  it("counts no missed control once a rider has finished", () => {
    const room = createRoom(
      roomSetup(defaultSetup(track, 3), [PLAYER_RIDER]),
      ROOM_LIMIT_TICKS
    );
    room.step();
    expect(room.missedControls(PLAYER_RIDER)).toBe(1);
    const rider = riderOf(room.state.riders, PLAYER_RIDER);
    if (rider) {
      rider.finishTick = 1;
    }
    room.step();
    expect(room.missedControls(PLAYER_RIDER)).toBe(1);
  });
});
