import { describe, expect, it } from "vitest";

import { controlOf } from "./control.ts";
import { track } from "./race-fixtures.ts";
import { defaultSetup, neutralInput } from "./race.ts";
import { createRoomClient } from "./room-client.ts";
import { createRoom, roomSetup } from "./room.ts";
import { PLAYER_RIDER } from "./state.ts";

const steering = (tick: number) =>
  controlOf({
    ...neutralInput,
    steer: tick % 20 < 10 ? 0.4 : -0.4,
    throttle: 1,
  });

const laggedTicks = (
  ticks: number,
  reachesRoom: (tick: number) => boolean
): readonly number[] => {
  const setup = roomSetup(defaultSetup(track, 3), [PLAYER_RIDER]);
  const room = createRoom(setup);
  const client = createRoomClient(setup, PLAYER_RIDER);
  const lagged: number[] = [];
  for (let tick = 1; tick <= ticks; tick += 1) {
    const control = steering(tick);
    client.predict(control);
    if (reachesRoom(tick)) {
      room.accept(PLAYER_RIDER, tick, [control]);
    }
    room.step();
    client.confirm(room.frame, null);
    if (client.lagging()) {
      lagged.push(tick);
    }
  }
  return lagged;
};

describe("a rider's lag tag", () => {
  it("stays off while the room rides the rider's own controls", () => {
    expect(laggedTicks(400, () => true)).toStrictEqual([]);
  });

  it("shows while the room overrules the rider, and clears after a clean second", () => {
    const lagged = laggedTicks(500, (tick) => tick < 100 || tick >= 220);
    expect(lagged[0]).toBeGreaterThan(100);
    expect(lagged[0]).toBeLessThan(160);
    expect(lagged.at(-1)).toBeGreaterThanOrEqual(220);
    expect(lagged.at(-1)).toBeLessThan(300);
  });

  it("does not show for a moment's loss", () => {
    expect(laggedTicks(400, (tick) => tick < 100 || tick >= 110)).toStrictEqual(
      []
    );
  });
});
