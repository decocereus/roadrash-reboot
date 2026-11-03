import { describe, expect, it } from "vitest";

import { controlOf } from "./control.ts";
import { track } from "./race-fixtures.ts";
import { defaultSetup, neutralInput } from "./race.ts";
import { createRoomClient } from "./room-client.ts";
import { createRoom, roomSetup } from "./room.ts";
import { PLAYER_RIDER, riderIdAt } from "./state.ts";
import type { Control } from "./state.ts";

const RIVAL = riderIdAt(1);
const RIDE_TICKS = 180;
const LEAD_TICKS = 30;
const riding = controlOf({ ...neutralInput, throttle: 1 });
const braking = controlOf({ ...neutralInput, brake: 1 });
const veering = controlOf({ ...neutralInput, steer: 1, throttle: 1 });

const rideTogether = () => {
  const setup = roomSetup(defaultSetup(track, 3), [PLAYER_RIDER, RIVAL]);
  const room = createRoom(setup);
  const client = createRoomClient(setup, PLAYER_RIDER);
  const step = (mine: Control, rival: Control): void => {
    room.accept(PLAYER_RIDER, room.state.tick + 1, [mine]);
    room.accept(RIVAL, room.state.tick + 1, [rival]);
    room.step();
  };
  for (let tick = 0; tick < RIDE_TICKS; tick += 1) {
    client.predict(riding);
    step(riding, riding);
    client.confirm(room.frame, null);
  }
  return { client, room, step };
};

describe("how far a correction moves the rider's own bike", () => {
  it("blames the rider's own control when the room rode a different one", () => {
    const { client, room, step } = rideTogether();
    for (let tick = 0; tick < LEAD_TICKS; tick += 1) {
      client.predict(riding);
    }
    for (let tick = 0; tick < LEAD_TICKS; tick += 1) {
      step(braking, riding);
      client.confirm(room.frame, null);
    }
    const { totalMetres, worstMetres } = client.stats.jumps.ownControl;
    expect(worstMetres).toBeGreaterThan(0);
    expect(totalMetres).toBeGreaterThanOrEqual(worstMetres);
    expect(client.stats.worstJump.metres).toBe(worstMetres);
    expect(client.stats.worstJump.roadMetres).toBeGreaterThan(0);
  });

  it("doesn't blame a rival whose steering never touched the bike", () => {
    const { client, room, step } = rideTogether();
    for (let tick = 0; tick < LEAD_TICKS; tick += 1) {
      client.predict(riding);
    }
    const rollbacksBefore = client.stats.rollbacks;
    for (let tick = 0; tick < LEAD_TICKS; tick += 1) {
      step(riding, veering);
      client.confirm(room.frame, null);
    }
    expect(client.stats.rollbacks).toBeGreaterThan(rollbacksBefore);
    expect(client.stats.jumps.ownControl.worstMetres).toBe(0);
    expect(client.stats.jumps.otherRiders.worstMetres).toBe(0);
  });

  it("counts a snap forward when the room passes the prediction", () => {
    const { client, room, step } = rideTogether();
    for (let tick = 0; tick < LEAD_TICKS; tick += 1) {
      step(riding, riding);
      client.confirm(room.frame, null);
    }
    expect(client.stats.jumps.behindServer.felt).toBeGreaterThan(0);
    expect(client.stats.jumps.ownControl.worstMetres).toBe(0);
  });

  it("counts the predictions it refuses when the room goes quiet", () => {
    const { client } = rideTogether();
    let refused = 0;
    for (let tick = 0; tick < 40; tick += 1) {
      refused += client.predict(riding) ? 0 : 1;
    }
    expect(refused).toBeGreaterThan(0);
    expect(client.stats.refusedPredictions).toBe(refused);
  });
});
