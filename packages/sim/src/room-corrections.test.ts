import { describe, expect, it } from "vitest";

import { controlOf } from "./control.ts";
import { ROOM_LIMIT_TICKS, track, truckRoad } from "./race-fixtures.ts";
import { defaultSetup, neutralInput } from "./race.ts";
import { createRoomClient } from "./room-client.ts";
import { createRoom, roomSetup } from "./room.ts";
import { PLAYER_RIDER, riderIdAt, riderOf } from "./state.ts";
import type { RiderId } from "./state.ts";

const VICTIM = PLAYER_RIDER;
const ATTACKER = riderIdAt(1);
const RIDE_TICKS = 240;
const riding = controlOf({ ...neutralInput, throttle: 1 });

const steering = (lead: number) => {
  const setup = roomSetup(defaultSetup(track, 3), [VICTIM, ATTACKER]);
  const room = createRoom(setup, ROOM_LIMIT_TICKS);
  const client = createRoomClient(setup, VICTIM, ROOM_LIMIT_TICKS);
  const swerve = controlOf({ ...neutralInput, steer: 1, throttle: 1 });
  for (let tick = 0; tick < lead; tick += 1) {
    client.predict(riding);
  }
  const moved = new Map<RiderId, number>();
  for (let tick = 0; tick < RIDE_TICKS; tick += 1) {
    room.accept(VICTIM, room.state.tick + 1, [riding]);
    room.accept(ATTACKER, room.state.tick + 1, [
      tick >= RIDE_TICKS / 2 ? swerve : riding,
    ]);
    room.step();
    client.confirm(room.frame, null);
    client.predict(riding);
    for (const { rider, x } of client.takeCorrections()) {
      moved.set(rider, Math.max(moved.get(rider) ?? 0, Math.abs(x)));
    }
  }
  return moved;
};

describe("how far a correction moved another rider", () => {
  it("grows with the lead, because the guess ran longer", () => {
    const near = steering(4).get(ATTACKER) ?? 0;
    const far = steering(20).get(ATTACKER) ?? 0;
    expect(near).toBeGreaterThan(0);
    expect(far).toBeGreaterThan(near * 2);
  });

  it("names the client's own bike when the room rode it differently, so its own bike glides too", () => {
    const setup = roomSetup(defaultSetup(track, 3), [VICTIM, ATTACKER]);
    const room = createRoom(setup, ROOM_LIMIT_TICKS);
    const client = createRoomClient(setup, VICTIM, ROOM_LIMIT_TICKS);
    const swerve = controlOf({ ...neutralInput, steer: 1, throttle: 1 });
    let ownMoved = 0;
    for (let tick = 0; tick < RIDE_TICKS; tick += 1) {
      client.predict(tick >= RIDE_TICKS / 2 ? swerve : riding);
      room.accept(VICTIM, room.state.tick + 1, [riding]);
      room.accept(ATTACKER, room.state.tick + 1, [riding]);
      room.step();
      client.confirm(room.frame, null);
      for (const { rider, x } of client.takeCorrections()) {
        ownMoved =
          rider === VICTIM ? Math.max(ownMoved, Math.abs(x)) : ownMoved;
      }
    }
    expect(ownMoved).toBeGreaterThan(0);
  });

  it("carries every change a correction made to how each bike sits, height and both speeds included", () => {
    const setup = roomSetup(defaultSetup(truckRoad, 3), [VICTIM, ATTACKER]);
    const room = createRoom(setup, ROOM_LIMIT_TICKS);
    const client = createRoomClient(setup, VICTIM, ROOM_LIMIT_TICKS);
    for (const state of [room.state, client.confirmed, client.predicted]) {
      const truck = state.cars.find(({ carrier }) => carrier);
      const rival = riderOf(state.riders, ATTACKER);
      if (truck && rival) {
        rival.s = truck.s - 55;
        rival.speed = 25;
        rival.x = truck.x;
      }
    }
    const braking = controlOf({ ...neutralInput, brake: 1 });
    const placed = () =>
      client.predicted.riders.map(
        ({ air, heading, lateralSpeed, lean, s, speed, x }) => [
          air,
          heading,
          lateralSpeed,
          lean,
          s,
          speed,
          x,
        ]
      );
    for (let tick = 0; tick < 20; tick += 1) {
      client.predict(riding);
    }
    let worstMiss = 0;
    let lifted = 0;
    for (let tick = 0; tick < 300; tick += 1) {
      room.accept(VICTIM, room.state.tick + 1, [riding]);
      room.accept(ATTACKER, room.state.tick + 1, [
        tick >= 130 && tick < 200 && tick % 10 < 2 ? braking : riding,
      ]);
      room.step();
      const before = placed();
      client.confirm(room.frame, null);
      client.settle();
      const after = placed();
      for (const moved of client.takeCorrections()) {
        const was = riderOf(before, moved.rider) ?? [];
        const now = riderOf(after, moved.rider) ?? [];
        const carried = [
          moved.air,
          moved.heading,
          moved.lateralSpeed,
          moved.lean,
          moved.s,
          moved.speed,
          moved.x,
        ];
        for (const [field, value] of carried.entries()) {
          const shift = (was[field] ?? 0) - (now[field] ?? 0);
          worstMiss = Math.max(worstMiss, Math.abs(value - shift));
        }
        lifted = Math.max(lifted, Math.abs(moved.air));
      }
      client.predict(riding);
    }
    expect(lifted).toBeGreaterThan(0.01);
    expect(worstMiss).toBeLessThan(1e-9);
  });

  it("names every bike when a stalled client falls behind the room, so the jump forward glides", () => {
    const setup = roomSetup(defaultSetup(track, 3), [VICTIM, ATTACKER]);
    const room = createRoom(setup, ROOM_LIMIT_TICKS);
    const client = createRoomClient(setup, VICTIM, ROOM_LIMIT_TICKS);
    for (let tick = 0; tick < 10; tick += 1) {
      client.predict(riding);
    }
    const along = new Map<RiderId, number>();
    for (let tick = 0; tick < 40; tick += 1) {
      room.accept(VICTIM, room.state.tick + 1, [riding]);
      room.accept(ATTACKER, room.state.tick + 1, [riding]);
      room.step();
      client.confirm(room.frame, null);
      for (const { rider, s: moved } of client.takeCorrections()) {
        along.set(rider, Math.max(along.get(rider) ?? 0, Math.abs(moved)));
      }
    }
    expect(along.get(VICTIM)).toBeGreaterThan(0);
    expect(along.get(ATTACKER)).toBeGreaterThan(0);
  });
});
