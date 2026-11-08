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
  drawnOff,
  driftSettle,
  stillDrift,
} from "../src/game/rider-drift.ts";

const ME = PLAYER_RIDER;
const RIVAL = riderIdAt(1);
const TICK_MS = TICK_SECONDS * 1000;
const FRAME_MS = 1000 / 60;
const FRAME_SECONDS = FRAME_MS / 1000;
const PING_EVERY_MS = 500;
const RIDE_MS = 28_000;
const SETTLED_AFTER_MS = 4000;
const CUT_FROM_MS = 20_000;
const GLIDE_LIMIT_METRES = 1;

interface Race {
  readonly downMs: (sentAt: number) => number;
  readonly upMs: (sentAt: number) => number;
  readonly brakesFrom?: number;
  readonly roomStallsMs?: number;
}

interface Drawn {
  frames: number;
  last: number;
  worstOff: number;
}

interface Screen {
  readonly me: Drawn;
  readonly missedInStall: number;
  readonly rival: Drawn;
}

const riderControl = (tick: number, every: number, braking: boolean): Control =>
  controlOf({
    ...neutralInput,
    brake: braking ? 1 : 0,
    steer: Math.floor(tick / every) % 2 === 0 ? 0.3 : -0.3,
    throttle: braking ? 0 : 1,
  });

const brakingAt = (race: Race, tick: number): boolean =>
  race.brakesFrom !== undefined &&
  tick * TICK_MS >= race.brakesFrom &&
  tick * TICK_MS < race.brakesFrom + 2000;

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

const seen = (): Drawn => ({
  frames: 0,
  last: Number.NaN,
  worstOff: 0,
});

const drawFrame = (
  drawn: Drawn,
  view: {
    after: { s: number };
    before: { s: number };
    drift: ReturnType<typeof stillDrift>;
  },
  rider: { mode: string; speed: number },
  blend: number,
  measured: boolean
): void => {
  driftSettle(view.drift, FRAME_SECONDS, rider.speed);
  const next =
    rider.mode === "riding"
      ? view.before.s + (view.after.s - view.before.s) * blend + view.drift.s
      : Number.NaN;
  if (measured && Number.isFinite(next) && Number.isFinite(drawn.last)) {
    drawn.frames += 1;
    drawn.worstOff = Math.max(
      drawn.worstOff,
      drawnOff(next, drawn.last, rider.speed, FRAME_SECONDS)
    );
  }
  drawn.last = next;
};

const rideOnScreen = (race: Race): Screen => {
  const link = race;
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
        const control = riderControl(tick, 40, brakingAt(race, tick));
        if (client.predict(control)) {
          controlsInFlight.push({ at: now + link.upMs(now), control, tick });
        }
      }
      capture("after");
    },
    () => clock.pace(client.predicted.tick, client.confirmed.tick, now)
  );
  const [mine, theirs] = views;
  const me = seen();
  const rival = seen();
  const stallFrom = CUT_FROM_MS;
  const stallTo = CUT_FROM_MS + (race.roomStallsMs ?? 0);
  let missedBefore = 0;
  let nextRoomAt = 0;
  let nextPing = 0;
  let lastDown = 0;
  for (now = 0; now < RIDE_MS; now += FRAME_MS) {
    for (const sent of takeDue(controlsInFlight, now)) {
      room.accept(ME, sent.tick, [sent.control]);
    }
    if (now < stallFrom) {
      missedBefore = room.missedControls(ME);
    }
    while (nextRoomAt <= now) {
      if (now >= stallFrom && now < stallTo) {
        break;
      }
      const tick = room.state.tick + 1;
      room.accept(RIVAL, tick, [riderControl(tick, 55, brakingAt(race, tick))]);
      room.step();
      const bytes = writeTick(
        packet,
        room.frame,
        room.hashed ? room.hash : null
      );
      const sentAt = Math.max(now, nextRoomAt);
      lastDown = Math.max(lastDown, sentAt + link.downMs(sentAt));
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
      clock.heardRtt(pong.at - pong.sent, pong.at);
    }
    advance(FRAME_SECONDS);
    const blend = fixed.accumulator / TICK_SECONDS;
    const myBike = riderOf(client.predicted.riders, ME);
    const theirBike = riderOf(client.predicted.riders, RIVAL);
    const measured = now >= SETTLED_AFTER_MS;
    if (mine && myBike) {
      drawFrame(me, mine, myBike, blend, measured);
    }
    if (theirs && theirBike) {
      drawFrame(rival, theirs, theirBike, blend, measured);
    }
  }
  return {
    me,
    missedInStall: room.missedControls(ME) - missedBefore,
    rival,
  };
};

describe("both bikes on screen in a room race", () => {
  it.each([
    [
      "a steady 150 ms round trip",
      { downMs: steadyMs(75), upMs: steadyMs(75) },
      0,
    ],
    [
      "a 2.5 s hold on ticks from the room",
      { downMs: cutFor(80, 2.5), upMs: steadyMs(80) },
      0,
    ],
    [
      "a 1.5 s cut both ways",
      { downMs: cutFor(80, 1.5), upMs: cutFor(80, 1.5) },
      90,
    ],
    [
      "a 2.5 s cut both ways",
      { downMs: cutFor(80, 2.5), upMs: cutFor(80, 2.5) },
      150,
    ],
    [
      "a 4 s hold on ticks from the room",
      { downMs: cutFor(80, 4), upMs: steadyMs(80) },
      0,
    ],
    [
      "a room that stops stepping for 2.5 s",
      { downMs: steadyMs(80), roomStallsMs: 2500, upMs: steadyMs(80) },
      0,
    ],
  ] as const)(
    "draws each bike within a quarter of its riding every frame over %s, and the room misses only controls the link lost",
    (_name, race, mostMissed) => {
      const screen = rideOnScreen(race);
      expect(screen.me.frames).toBeGreaterThan(1200);
      expect(screen.me.worstOff).toBeLessThan(0.05);
      expect(screen.rival.worstOff).toBeLessThan(0.05);
      expect(screen.missedInStall).toBeLessThanOrEqual(mostMissed);
    }
  );

  it.each([
    [
      "the player brakes through a 2.5 s cut both ways",
      {
        brakesFrom: CUT_FROM_MS,
        downMs: cutFor(80, 2.5),
        upMs: cutFor(80, 2.5),
      },
    ],
    [
      "the rival brakes through a 2.5 s hold on ticks from the room",
      { brakesFrom: CUT_FROM_MS, downMs: cutFor(80, 2.5), upMs: steadyMs(80) },
    ],
  ] as const)(
    "glides each bike onto the room's race without a jump when %s",
    (_name, race) => {
      const screen = rideOnScreen(race);
      expect(screen.me.frames).toBeGreaterThan(1200);
      expect(screen.me.worstOff).toBeLessThan(GLIDE_LIMIT_METRES);
      expect(screen.rival.worstOff).toBeLessThan(GLIDE_LIMIT_METRES);
    }
  );
});
