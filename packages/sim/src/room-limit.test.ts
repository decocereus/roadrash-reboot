import { describe, expect, it } from "vitest";

import { controlOf } from "./control.ts";
import { track } from "./race-fixtures.ts";
import { defaultSetup, neutralInput } from "./race.ts";
import { createRoomClient } from "./room-client.ts";
import { createRoom, PILOT_FROM_TICK, roomSetup } from "./room.ts";
import { PLAYER_RIDER, riderIdAt, riderOf } from "./state.ts";

const RIVAL = riderIdAt(1);

describe("a room's time limit", () => {
  it("hands a seat still sending controls to the pilot and keeps it there", () => {
    const room = createRoom(roomSetup(defaultSetup(track, 3), [PLAYER_RIDER]));
    const stopped = controlOf(neutralInput);
    const controllerAfterStep = (): string | undefined => {
      room.accept(PLAYER_RIDER, room.state.tick + 1, [stopped]);
      room.step();
      return riderOf(room.state.riders, PLAYER_RIDER)?.controller;
    };
    while (room.state.tick < PILOT_FROM_TICK - 2) {
      controllerAfterStep();
    }
    expect(controllerAfterStep()).toBe("human");
    expect(controllerAfterStep()).toBe("pilot");
    expect(controllerAfterStep()).toBe("pilot");
    expect(room.over()).toBeFalsy();
  }, 120_000);

  it("predicts the handover, so no client rolls back for it", () => {
    const setup = roomSetup(defaultSetup(track, 3), [PLAYER_RIDER, RIVAL]);
    const room = createRoom(setup);
    const client = createRoomClient(setup, PLAYER_RIDER);
    const stopped = controlOf(neutralInput);
    while (room.state.tick < PILOT_FROM_TICK + 60) {
      client.predict(stopped);
      room.accept(PLAYER_RIDER, room.state.tick + 1, [stopped]);
      room.accept(RIVAL, room.state.tick + 1, [stopped]);
      room.step();
      client.confirm(room.frame, room.hashed ? room.hash : null);
    }
    expect(client.stats.rollbacks).toBe(0);
    expect(client.stats.desyncs).toBe(0);
  }, 120_000);
});
