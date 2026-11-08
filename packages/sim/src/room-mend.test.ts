import { describe, expect, it } from "vitest";

import { controlOf } from "./control.ts";
import { ROOM_LIMIT_TICKS, track } from "./race-fixtures.ts";
import { defaultSetup, neutralInput } from "./race.ts";
import { createRoomClient, MOST_TICKS_PER_SETTLE } from "./room-client.ts";
import type { RoomClient } from "./room-client.ts";
import { createRoom, roomSetup } from "./room.ts";
import { PLAYER_RIDER, riderIdAt } from "./state.ts";

const RIVAL = riderIdAt(1);
const HEARD_TICKS = 100;
const AHEAD_TICKS = 400;
const FRAMES = 20;

const weaving = (tick: number, every: number) =>
  controlOf({
    ...neutralInput,
    steer: Math.floor(tick / every) % 2 === 0 ? 0.4 : -0.4,
    throttle: 1,
  });

const placesOf = (client: RoomClient): readonly (readonly number[])[] =>
  client.predicted.riders.map((rider) => [rider.s, rider.x, rider.speed]);

const mendedRace = () => {
  const setup = roomSetup(defaultSetup(track, 3), [PLAYER_RIDER, RIVAL]);
  const room = createRoom(setup, ROOM_LIMIT_TICKS);
  const ahead = createRoomClient(setup, PLAYER_RIDER, ROOM_LIMIT_TICKS);
  const behind = createRoomClient(setup, PLAYER_RIDER, ROOM_LIMIT_TICKS);
  for (let tick = 1; tick <= AHEAD_TICKS; tick += 1) {
    ahead.predict(weaving(tick, 25));
  }
  for (let tick = 1; tick <= HEARD_TICKS; tick += 1) {
    room.accept(PLAYER_RIDER, tick, [weaving(tick, 25)]);
    room.accept(RIVAL, tick, [weaving(tick, 7)]);
    room.step();
    ahead.confirm(room.frame, null);
    behind.confirm(room.frame, null);
  }
  for (let tick = HEARD_TICKS + 1; tick <= AHEAD_TICKS; tick += 1) {
    behind.predict(weaving(tick, 25));
  }
  const replayed: number[] = [];
  for (let tick = AHEAD_TICKS + 1; tick <= AHEAD_TICKS + FRAMES; tick += 1) {
    const before = ahead.stats.resimulatedTicks;
    ahead.settle();
    ahead.predict(weaving(tick, 25));
    replayed.push(ahead.stats.resimulatedTicks - before);
    behind.predict(weaving(tick, 25));
  }
  return { ahead, behind, replayed };
};

describe("a long rollback on the room client", () => {
  it("replays at most a frame's share of ticks for each tick it predicts", () => {
    const { replayed } = mendedRace();
    expect(replayed.filter((ticks) => ticks > 0).length).toBeGreaterThan(4);
    expect(Math.max(...replayed)).toBeLessThanOrEqual(MOST_TICKS_PER_SETTLE);
  });

  it("lands every rider where one long replay would, while it kept predicting", () => {
    const { ahead, behind } = mendedRace();
    expect(ahead.predicted.tick).toBe(behind.predicted.tick);
    expect(placesOf(ahead)).toStrictEqual(placesOf(behind));
    expect(ahead.stats.rollbacks).toBe(1);
  });
});
