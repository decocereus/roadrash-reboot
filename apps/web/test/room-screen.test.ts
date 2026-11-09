import { controlOf } from "@racer/sim/control";
import { defaultSetup, neutralInput } from "@racer/sim/race";
import { ROOM_LIMIT_TICKS, straight } from "@racer/sim/race-fixtures";
import { createRoom, roomSetup } from "@racer/sim/room";
import { createRoomClient } from "@racer/sim/room-client";
import { createRoomClock } from "@racer/sim/room-clock";
import { createTickFrame } from "@racer/sim/room-frame";
import {
  createInputBatch,
  createReadTick,
  inputBytes,
  MOST_BATCHED_CONTROLS,
  readInput,
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
  placeDrawn,
  stillDrawn,
  stillDrift,
} from "../src/game/rider-drift.ts";
import type { DrawnPlace, RiderDrift } from "../src/game/rider-drift.ts";

const ME = PLAYER_RIDER;
const RIVAL = riderIdAt(1);
const TICK_MS = TICK_SECONDS * 1000;
const FRAME_MS = 1000 / 60;
const FRAME_SECONDS = FRAME_MS / 1000;
const PING_EVERY_MS = 500;
const RIDE_MS = 28_000;
const SETTLED_AFTER_MS = 4000;
const CUT_FROM_MS = 20_000;
const GLIDE_SHARE = 0.1;
const MOST_GLIDE_ACROSS = 2.5;
const GLIDE_ACCELERATION = 25;
const FRAME_SLACK_METRES = 0.01;

interface Race {
  readonly downMs: (sentAt: number) => number;
  readonly upMs: (sentAt: number) => number;
  readonly brakesFrom?: number;
  readonly roomStallsMs?: number;
}

interface Drawn {
  frames: number;
  worstGlide: number;
  worstOff: number;
}

interface OwnPath {
  afterS: number;
  afterX: number;
  beforeS: number;
  beforeX: number;
  carried: number;
  carriedAcross: number;
  followed: boolean;
  kicked: number;
  lastS: number;
  lastX: number;
  offS: number;
  offX: number;
  s: number;
  swerved: number;
  x: number;
}

interface Pose {
  air: number;
  heading: number;
  lean: number;
  s: number;
  tick: number;
  x: number;
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

const pose = (): Pose => ({ air: 0, heading: 0, lean: 0, s: 0, tick: 0, x: 0 });

const seen = (): Drawn => ({ frames: 0, worstGlide: 0, worstOff: 0 });

const ownPath = (): OwnPath => ({
  afterS: 0,
  afterX: 0,
  beforeS: 0,
  beforeX: 0,
  carried: 0,
  carriedAcross: 0,
  followed: false,
  kicked: 0,
  lastS: 0,
  lastX: 0,
  offS: 0,
  offX: 0,
  s: 0,
  swerved: 0,
  x: 0,
});

const followOwn = (
  path: OwnPath,
  rider: { readonly s: number; readonly x: number },
  into: "after" | "before"
): void => {
  path.s += rider.s - path.lastS;
  path.x += rider.x - path.lastX;
  path.lastS = rider.s;
  path.lastX = rider.x;
  if (into === "before") {
    path.beforeS = path.s;
    path.beforeX = path.x;
  } else {
    path.afterS = path.s;
    path.afterX = path.x;
  }
};

const glidedPast = (
  path: OwnPath,
  drawn: DrawnPlace,
  speed: number,
  blend: number
): number => {
  const offS = drawn.s - (path.beforeS + (path.afterS - path.beforeS) * blend);
  const offX = drawn.x - (path.beforeX + (path.afterX - path.beforeX) * blend);
  path.carried =
    Math.max(0, path.carried - GLIDE_ACCELERATION * FRAME_SECONDS) +
    Math.abs(path.kicked);
  path.carriedAcross =
    Math.max(0, path.carriedAcross - GLIDE_ACCELERATION * FRAME_SECONDS) +
    Math.abs(path.swerved);
  path.kicked = 0;
  path.swerved = 0;
  const past = Math.max(
    Math.abs(offS - path.offS) -
      (GLIDE_SHARE * Math.abs(speed) + path.carried) * FRAME_SECONDS,
    Math.abs(offX - path.offX) -
      (MOST_GLIDE_ACROSS + path.carriedAcross) * FRAME_SECONDS
  );
  path.offS = offS;
  path.offX = offX;
  return past;
};

const drawFrame = (
  drawn: Drawn,
  view: { after: Pose; before: Pose; drawn: DrawnPlace; drift: RiderDrift },
  path: OwnPath,
  rider: { mode: string; speed: number },
  blend: number,
  measured: boolean
): void => {
  const wasRiding = view.drawn.riding;
  placeDrawn(view, rider, blend, FRAME_SECONDS);
  const past = glidedPast(path, view.drawn, rider.speed, blend);
  const riding = rider.mode === "riding";
  if (measured && riding) {
    drawn.frames += 1;
    drawn.worstOff = Math.max(drawn.worstOff, view.drawn.off);
  }
  if (measured && riding && wasRiding && path.followed) {
    drawn.worstGlide = Math.max(drawn.worstGlide, past);
  }
  path.followed = riding;
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
  const controlsInFlight: {
    at: number;
    controls: Control[];
    firstTick: number;
  }[] = [];
  const input = new DataView(
    new ArrayBuffer(inputBytes(MOST_BATCHED_CONTROLS))
  );
  const batch = createInputBatch();
  const pongs: { at: number; sent: number }[] = [];
  const views = client.predicted.riders.map(() => ({
    after: pose(),
    before: pose(),
    drawn: stillDrawn(),
    drift: stillDrift(),
  }));
  const paths = client.predicted.riders.map(ownPath);
  const capture = (into: "after" | "before") => {
    const taken = client.takeCorrections();
    for (const moved of taken) {
      const path = riderOf(paths, moved.rider);
      if (path) {
        path.lastS -= moved.s;
        path.lastX -= moved.x;
        path.kicked += moved.speed;
        path.swerved += moved.lateralSpeed;
      }
    }
    for (const rider of client.predicted.riders) {
      const path = riderOf(paths, rider.id);
      if (path) {
        followOwn(path, rider, into);
      }
    }
    captureCast(into, client.predicted.riders, views, taken, (rider, posed) => {
      posed.air = rider.air;
      posed.heading = rider.heading;
      posed.lean = rider.lean;
      posed.s = rider.s;
      posed.tick = client.predicted.tick;
      posed.x = rider.x;
    });
  };
  let now = 0;
  const sendInputs = () => {
    for (
      let bytes = client.writeInputs(input);
      bytes > 0;
      bytes = client.writeInputs(input)
    ) {
      readInput(new DataView(input.buffer, 0, bytes), batch);
      controlsInFlight.push({
        at: now + link.upMs(now),
        controls: [...batch.controls],
        firstTick: batch.firstTick,
      });
    }
  };
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
        client.predict(
          riderControl(tick, 40, brakingAt(race, tick)),
          clock.inputDelay(client.predicted.tick, now)
        );
      }
      sendInputs();
      capture("after");
    },
    () => clock.pace(client.predicted.tick, client.confirmed.tick, now)
  );
  const [mine, theirs] = views;
  const [myPath, theirPath] = paths;
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
      room.accept(ME, sent.firstTick, sent.controls);
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
    if (mine && myPath && myBike) {
      drawFrame(me, mine, myPath, myBike, blend, measured);
    }
    if (theirs && theirPath && theirBike) {
      drawFrame(rival, theirs, theirPath, theirBike, blend, measured);
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
    "draws each bike within its pace and glide limits every frame over %s, never leaving its own path faster than a glide, and the room misses only controls the link lost",
    (_name, race, mostMissed) => {
      const screen = rideOnScreen(race);
      expect(screen.me.frames).toBeGreaterThan(1200);
      expect({
        glided:
          Math.max(screen.me.worstGlide, screen.rival.worstGlide) <
          FRAME_SLACK_METRES,
        off:
          Math.max(screen.me.worstOff, screen.rival.worstOff) <
          FRAME_SLACK_METRES,
      }).toStrictEqual({ glided: true, off: true });
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
      expect({
        glided:
          Math.max(screen.me.worstGlide, screen.rival.worstGlide) <
          FRAME_SLACK_METRES,
        off:
          Math.max(screen.me.worstOff, screen.rival.worstOff) <
          FRAME_SLACK_METRES,
      }).toStrictEqual({ glided: true, off: true });
    }
  );
});
