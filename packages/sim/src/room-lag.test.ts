import { describe, expect, it } from "vitest";

import { controlOf } from "./control.ts";
import { track } from "./race-fixtures.ts";
import { defaultSetup, neutralInput } from "./race.ts";
import { createRoomClient } from "./room-client.ts";
import type { TickFrame } from "./room-frame.ts";
import {
  createInputBatch,
  inputBytes,
  MOST_BATCHED_CONTROLS,
  readInput,
} from "./room-wire.ts";
import { createRoom, PILOT_FROM_TICK, roomSetup } from "./room.ts";
import { PLAYER_RIDER } from "./state.ts";

const steering = (tick: number) =>
  controlOf({
    ...neutralInput,
    steer: tick % 20 < 10 ? 0.4 : -0.4,
    throttle: 1,
  });

const ridden = (ticks: number, reachesRoom: (tick: number) => boolean) => {
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
  return { lagged, lost: client.lostControls() };
};

const laggedTicks = (
  ticks: number,
  reachesRoom: (tick: number) => boolean
): readonly number[] => ridden(ticks, reachesRoom).lagged;

const KICK_FROM = 100;
const KICK_TICKS = 8;
const STALL_TICKS = 300;
const kickHeld = (tick: number, from: readonly number[] = [KICK_FROM]) =>
  from.some((start) => tick >= start && tick < start + KICK_TICKS);

interface PressesRidden {
  readonly kicks: number;
  readonly retried: number;
}

const kicksTheRoomRode = (
  reachesRoom: (tick: number) => boolean,
  kicksFrom: readonly number[] = [KICK_FROM],
  confirmsEvery = 1
): PressesRidden => {
  const setup = roomSetup(defaultSetup(track, 3), [PLAYER_RIDER]);
  const room = createRoom(setup);
  const client = createRoomClient(setup, PLAYER_RIDER);
  const out = new DataView(new ArrayBuffer(inputBytes(MOST_BATCHED_CONTROLS)));
  const batch = createInputBatch();
  let kicks = 0;
  const heldBack: TickFrame[] = [];
  for (let tick = 1; tick <= 300; tick += 1) {
    client.predict(
      controlOf({
        ...neutralInput,
        kick: kickHeld(tick, kicksFrom),
        throttle: 1,
      })
    );
    const length = client.writeInputs(out);
    if (
      reachesRoom(tick) &&
      readInput(new DataView(out.buffer, 0, length), batch)
    ) {
      room.accept(PLAYER_RIDER, batch.firstTick, batch.controls);
    }
    room.step();
    kicks += room.state.events.filter(
      (event) => event.kind === "attack" && event.rider === PLAYER_RIDER
    ).length;
    heldBack.push({
      controls: new Map(room.frame.controls),
      handovers: new Map(room.frame.handovers),
      tick: room.frame.tick,
    });
    if (reachesRoom(tick) || tick % confirmsEvery === 0) {
      for (const frame of heldBack.splice(0)) {
        client.confirm(frame, null);
      }
    }
  }
  return { kicks, retried: client.stats.retriedPresses };
};

const stalled = (tick: number) => tick < 95 || tick > 170;

describe("a rider's press the room never rode", () => {
  it("sends each of two presses again when a stall swallows both", () => {
    expect(kicksTheRoomRode(stalled, [100, 145], STALL_TICKS)).toStrictEqual({
      kicks: 2,
      retried: 2,
    });
  });

  it("is sent again, once, when every tick of it arrived too late", () => {
    expect([
      kicksTheRoomRode(() => true),
      kicksTheRoomRode((tick) => !kickHeld(tick)),
      kicksTheRoomRode((tick) => tick !== KICK_FROM),
    ]).toStrictEqual([
      { kicks: 1, retried: 0 },
      { kicks: 1, retried: 1 },
      { kicks: 1, retried: 0 },
    ]);
  });
});

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

  it("stays off when the race's time limit hands every rider to the pilot", () => {
    expect(laggedTicks(PILOT_FROM_TICK + 120, () => true)).toStrictEqual([]);
  }, 120_000);

  it("counts every tick the room rode without the rider's own control", () => {
    expect([
      ridden(400, () => true).lost,
      ridden(400, (tick) => tick < 100 || tick >= 110).lost,
    ]).toStrictEqual([0, 10]);
  });

  it("does not show for a moment's loss", () => {
    expect(laggedTicks(400, (tick) => tick < 100 || tick >= 110)).toStrictEqual(
      []
    );
  });
});
