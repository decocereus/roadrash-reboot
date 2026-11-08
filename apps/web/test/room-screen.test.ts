import { controlOf } from "@racer/sim/control";
import { defaultSetup, neutralInput } from "@racer/sim/race";
import { ROOM_LIMIT_TICKS, straight } from "@racer/sim/race-fixtures";
import { createRoom, roomSetup } from "@racer/sim/room";
import { createRoomClient } from "@racer/sim/room-client";
import { createRoomClock } from "@racer/sim/room-clock";
import { createTickFrame } from "@racer/sim/room-frame";
import {
  createReadTick,
  readTick,
  tickCapacity,
  writeTick,
} from "@racer/sim/room-wire";
import {
  PLAYER_RIDER,
  riderIdAt,
  riderOf,
  TICK_SECONDS,
} from "@racer/sim/state";
import type { Control } from "@racer/sim/state";
import { describe, expect, it } from "vitest";

import { createFixedTick } from "../src/game/fixed-tick.ts";
import {
  captureCast,
  driftSettle,
  stillDrift,
} from "../src/game/rider-drift.ts";

const ME = PLAYER_RIDER;
const RIVAL = riderIdAt(1);
const TICK_MS = TICK_SECONDS * 1000;
const FRAME_MS = 1000 / 60;
const PING_EVERY_MS = 500;
const RIDE_MS = 28_000;
const SETTLED_AFTER_MS = 4000;
const CUT_FROM_MS = 20_000;

interface Link {
  readonly downMs: (sentAt: number) => number;
  readonly upMs: (sentAt: number) => number;
}

interface Screen {
  readonly fastest: number;
  readonly frames: number;
  readonly leapMetres: number;
  readonly slowest: number;
}

const weaving = (tick: number): Control =>
  controlOf({
    ...neutralInput,
    steer: Math.floor(tick / 40) % 2 === 0 ? 0.3 : -0.3,
    throttle: 1,
  });

const riding = controlOf({ ...neutralInput, throttle: 1 });

const steadyMs = (ms: number) => (): number => ms;

const cutFor =
  (baseMs: number, seconds: number) =>
  (sentAt: number): number =>
    sentAt >= CUT_FROM_MS && sentAt < CUT_FROM_MS + seconds * 1000
      ? CUT_FROM_MS + seconds * 1000 - sentAt + baseMs
      : baseMs;

const takeDue = <Due extends { readonly at: number }>(
  queue: Due[],
  now: number
): Due[] => {
  const due: Due[] = [];
  while ((queue[0]?.at ?? Number.POSITIVE_INFINITY) <= now) {
    const next = queue.shift();
    if (next) {
      due.push(next);
    }
  }
  return due;
};

const pose = () => ({ heading: 0, lean: 0, s: 0, x: 0 });

const copy = (
  rider: { heading: number; lean: number; s: number; x: number },
  into: { heading: number; lean: number; s: number; x: number }
) => {
  into.heading = rider.heading;
  into.lean = rider.lean;
  into.s = rider.s;
  into.x = rider.x;
};

const rideOnScreen = (link: Link): Screen => {
  const setup = roomSetup(defaultSetup(straight, 3), [ME, RIVAL]);
  const room = createRoom(setup, ROOM_LIMIT_TICKS);
  const client = createRoomClient(setup, ME, ROOM_LIMIT_TICKS);
  const clock = createRoomClock();
  clock.heardRoomTime(0, link.downMs(0));
  clock.start(0);
  const packet = new DataView(new ArrayBuffer(tickCapacity(2)));
  const read = createReadTick(createTickFrame());
  const inFlight: { at: number; bytes: Uint8Array }[] = [];
  const controlsInFlight: { at: number; tick: number; control: Control }[] = [];
  const pongs: { at: number; sent: number }[] = [];
  const views = client.predicted.riders.map(() => ({
    after: pose(),
    before: pose(),
    drift: stillDrift(),
  }));
  const capture = (into: "after" | "before") => {
    captureCast(
      into,
      client.predicted.riders,
      views,
      client.takeCorrections(),
      copy
    );
  };
  let now = 0;
  const fixed = { accumulator: 0, clockReset: false };
  const advance = createFixedTick(
    fixed,
    () => false,
    () => {
      capture("before");
      client.settle();
      const steps = clock.stepsDue(
        client.predicted.tick,
        client.confirmed.tick,
        now
      );
      for (let step = 0; step < steps; step += 1) {
        const tick = client.predicted.tick + 1;
        const control = weaving(tick);
        if (client.predict(control)) {
          controlsInFlight.push({ at: now + link.upMs(now), control, tick });
        }
      }
      capture("after");
    },
    () => clock.pace(client.predicted.tick, client.confirmed.tick, now)
  );
  const [mine] = views;
  let nextRoomAt = 0;
  let nextPing = 0;
  let lastDown = 0;
  let drawn = Number.NaN;
  let fastest = 0;
  let slowest = Number.POSITIVE_INFINITY;
  let leapMetres = 0;
  let frames = 0;
  for (now = 0; now < RIDE_MS; now += FRAME_MS) {
    for (const sent of takeDue(controlsInFlight, now)) {
      room.accept(ME, sent.tick, [sent.control]);
    }
    while (nextRoomAt <= now) {
      room.accept(RIVAL, room.state.tick + 1, [riding]);
      room.step();
      const bytes = writeTick(
        packet,
        room.frame,
        room.hashed ? room.hash : null
      );
      lastDown = Math.max(lastDown, nextRoomAt + link.downMs(nextRoomAt));
      inFlight.push({
        at: lastDown,
        bytes: new Uint8Array(packet.buffer.slice(0, bytes)),
      });
      nextRoomAt += TICK_MS;
    }
    for (const arrived of takeDue(inFlight, now)) {
      readTick(new DataView(arrived.bytes.buffer), read);
      clock.heardTick(read.frame.tick, arrived.at);
      client.confirm(read.frame, read.hashed ? read.hash : null);
    }
    while (nextPing <= now) {
      const up = link.upMs(nextPing);
      pongs.push({
        at: nextPing + up + link.downMs(nextPing + up),
        sent: nextPing,
      });
      nextPing += PING_EVERY_MS;
    }
    for (const pong of takeDue(pongs, now)) {
      clock.heardRtt(pong.at - pong.sent);
    }
    advance(FRAME_MS / 1000);
    const me = riderOf(client.predicted.riders, ME);
    if (mine && me) {
      driftSettle(mine.drift, FRAME_MS / 1000, me.speed);
      const blend = fixed.accumulator / TICK_SECONDS;
      const next =
        mine.before.s + (mine.after.s - mine.before.s) * blend + mine.drift.s;
      const expected = (me.speed * FRAME_MS) / 1000;
      if (
        now >= SETTLED_AFTER_MS &&
        Number.isFinite(drawn) &&
        expected > 0.25
      ) {
        const moved = next - drawn;
        frames += 1;
        fastest = Math.max(fastest, moved / expected);
        slowest = Math.min(slowest, moved / expected);
        leapMetres = Math.max(leapMetres, Math.abs(moved - expected));
      }
      drawn = next;
    }
  }
  return { fastest, frames, leapMetres, slowest };
};

describe("the player's own bike on screen in a room race", () => {
  it.each([
    [
      "a steady 150 ms round trip",
      { downMs: steadyMs(75), upMs: steadyMs(75) },
    ],
    [
      "a 2.5 s hold on ticks from the room",
      { downMs: cutFor(80, 2.5), upMs: steadyMs(80) },
    ],
    [
      "a 1.5 s cut both ways while the rider weaves",
      { downMs: cutFor(80, 1.5), upMs: cutFor(80, 1.5) },
    ],
    [
      "a 2.5 s cut both ways while the rider weaves",
      { downMs: cutFor(80, 2.5), upMs: cutFor(80, 2.5) },
    ],
    [
      "a 4 s hold on ticks from the room",
      { downMs: cutFor(80, 4), upMs: steadyMs(80) },
    ],
  ] as const)(
    "moves within a fifth of its speed every frame over %s",
    (_name, link) => {
      const screen = rideOnScreen(link);
      expect(screen.frames).toBeGreaterThan(1200);
      expect(screen.slowest).toBeGreaterThanOrEqual(0.78);
      expect(screen.fastest).toBeLessThanOrEqual(1.22);
      expect(screen.leapMetres).toBeLessThan(0.5);
    }
  );
});
