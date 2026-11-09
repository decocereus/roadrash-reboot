import { controlOf } from "@racer/sim/control";
import { defaultSetup, neutralInput } from "@racer/sim/race";
import { ROOM_LIMIT_TICKS, straight } from "@racer/sim/race-fixtures";
import { createRoom, roomSetup } from "@racer/sim/room";
import { createRoomClient } from "@racer/sim/room-client";
import type { RiderCorrection, RoomClient } from "@racer/sim/room-client";
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
  BIKE_HALF_WIDTH,
  PLAYER_RIDER,
  riderIdAt,
  riderOf,
  TICK_SECONDS,
} from "@racer/sim/state";
import type { Control } from "@racer/sim/state";
import { kick, punch } from "@racer/sim/weapons";
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
const FASTEST_GLIDE_SHARE = 0.25;
const SLOWEST_GLIDE_ALONG = 0.5;
const GLIDE_ACCELERATION = 200;
const GLIDE_SETTLE_SECONDS = 0.1;
const TRUSTED_ALONG = punch.reachS / 2;
const TRUSTED_ACROSS = punch.reachX / 2;
const STRIKE_SECONDS = kick.ticks * TICK_SECONDS;
const MOST_GLIDE_ACROSS = punch.reachX / STRIKE_SECONDS;
const CATCH_UP_SECONDS = 0.05;
const CATCH_UP_SHARE = 1 - Math.exp(-FRAME_SECONDS / CATCH_UP_SECONDS);
const SKIP_METRES = 20;
const FRAME_SLACK_METRES = 0.01;
const BIKE_WIDTH = 2 * BIKE_HALF_WIDTH;
const MOST_BEYOND_REACH_FRAMES = 18;

interface Race {
  readonly downMs: (sentAt: number) => number;
  readonly upMs: (sentAt: number) => number;
  readonly brakesFrom?: number;
  readonly rideMs?: number;
  readonly roomStallsMs?: number;
}

interface OwnCorrections {
  count: number;
  total: number;
  worst: number;
}

interface Paced {
  frozenFrames: number;
  pausedFrames: number;
  pausedSeconds: number[];
}

interface Drawn {
  beyondReach: number;
  frames: number;
  lastX: number;
  wasBeyond: boolean;
  worstGlide: number;
  worstOff: number;
  worstStep: number;
}

interface OwnPath {
  afterS: number;
  afterX: number;
  beforeS: number;
  beforeX: number;
  carried: number;
  carriedAcross: number;
  fastAlong: number;
  followed: boolean;
  gapS: number;
  gapX: number;
  jumpedS: number;
  jumpedX: number;
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
  readonly own: OwnCorrections;
  readonly paced: Paced;
  readonly refused: number;
  readonly rival: Drawn;
  readonly jumps: RoomClient["stats"]["jumps"];
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

const noise = (sentAt: number, salt: number): number => {
  const seed = Math.floor(sentAt * 7 + salt) * 2_654_435_761;
  return (seed % 1_000_003) / 1_000_003;
};

const stalledEvery =
  (
    baseMs: number,
    jitterMs: number,
    everyMs: number,
    stallMs: number,
    salt: number
  ) =>
  (sentAt: number): number => {
    const sinceStall = sentAt % everyMs;
    const held =
      sentAt >= everyMs && sinceStall < stallMs ? stallMs - sinceStall : 0;
    return held + baseMs + jitterMs * noise(sentAt, salt);
  };

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

const seen = (): Drawn => ({
  beyondReach: 0,
  frames: 0,
  lastX: Number.NaN,
  wasBeyond: false,
  worstGlide: 0,
  worstOff: 0,
  worstStep: 0,
});

const ownPath = (): OwnPath => ({
  afterS: 0,
  afterX: 0,
  beforeS: 0,
  beforeX: 0,
  carried: 0,
  carriedAcross: 0,
  fastAlong: 0,
  followed: false,
  gapS: 0,
  gapX: 0,
  jumpedS: 0,
  jumpedX: 0,
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

const pastTrusted = (off: number, trusted: number): number =>
  Math.max(0, Math.abs(off) - trusted) / GLIDE_SETTLE_SECONDS;

const glideAlong = (speed: number, off: number): number =>
  Math.max(
    SLOWEST_GLIDE_ALONG,
    Math.min(
      FASTEST_GLIDE_SHARE * Math.abs(speed),
      GLIDE_SHARE * Math.abs(speed) + pastTrusted(off, TRUSTED_ALONG)
    )
  );

const cutAllowed = (gap: number, reach: number, trusted: number): number => {
  const beyond = Math.abs(gap) - trusted;
  if (Math.abs(gap) > SKIP_METRES) {
    return beyond;
  }
  return Math.abs(gap) > reach ? beyond * CATCH_UP_SHARE : 0;
};

const beyondReach = (path: OwnPath): boolean =>
  Math.abs(path.gapS + path.jumpedS) > punch.reachS ||
  Math.abs(path.gapX + path.jumpedX) > punch.reachX;

const glidedPast = (
  path: OwnPath,
  view: { after: Pose; before: Pose; drawn: DrawnPlace },
  speed: number,
  blend: number
): number => {
  const { drawn } = view;
  const offS = drawn.s - (path.beforeS + (path.afterS - path.beforeS) * blend);
  const offX = drawn.x - (path.beforeX + (path.afterX - path.beforeX) * blend);
  const slowed = GLIDE_ACCELERATION * FRAME_SECONDS;
  const gapS = path.gapS + path.jumpedS;
  const gapX = path.gapX + path.jumpedX;
  path.carried = Math.max(0, path.carried - slowed) + Math.abs(path.kicked);
  path.carriedAcross =
    Math.max(0, path.carriedAcross - slowed) + Math.abs(path.swerved);
  path.fastAlong = Math.max(glideAlong(speed, gapS), path.fastAlong - slowed);
  path.jumpedS = 0;
  path.jumpedX = 0;
  path.kicked = 0;
  path.swerved = 0;
  const past = Math.max(
    Math.abs(offS - path.offS) -
      (path.fastAlong + path.carried) * FRAME_SECONDS -
      cutAllowed(gapS, punch.reachS, TRUSTED_ALONG),
    Math.abs(offX - path.offX) -
      (MOST_GLIDE_ACROSS + path.carriedAcross) * FRAME_SECONDS -
      (Math.abs(gapX) > SKIP_METRES
        ? cutAllowed(gapX, punch.reachX, TRUSTED_ACROSS)
        : Math.min(
            BIKE_HALF_WIDTH - MOST_GLIDE_ACROSS * FRAME_SECONDS,
            cutAllowed(gapX, punch.reachX, TRUSTED_ACROSS)
          ))
  );
  path.offS = offS;
  path.offX = offX;
  path.gapS =
    drawn.s - (view.before.s + (view.after.s - view.before.s) * blend);
  path.gapX =
    drawn.x - (view.before.x + (view.after.x - view.before.x) * blend);
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
  const beyond = beyondReach(path);
  placeDrawn(view, rider, blend, FRAME_SECONDS);
  const past = glidedPast(path, view, rider.speed, blend);
  const riding = rider.mode === "riding";
  if (measured && riding) {
    drawn.frames += 1;
    drawn.beyondReach += beyond ? 1 : 0;
    if (!beyond && !drawn.wasBeyond) {
      drawn.worstOff = Math.max(drawn.worstOff, view.drawn.off);
    }
    if (wasRiding && !Number.isNaN(drawn.lastX)) {
      drawn.worstStep = Math.max(
        drawn.worstStep,
        Math.abs(view.drawn.x - drawn.lastX)
      );
    }
    drawn.lastX = view.drawn.x;
  } else {
    drawn.lastX = Number.NaN;
  }
  if (measured && riding && wasRiding && path.followed) {
    drawn.worstGlide = Math.max(drawn.worstGlide, past);
  }
  drawn.wasBeyond = beyond;
  path.followed = riding;
};

const tallyOwn = (own: OwnCorrections, moved: RiderCorrection): void => {
  if (moved.rider === ME) {
    const size = Math.max(Math.abs(moved.s), Math.abs(moved.x));
    own.count += 1;
    own.total += size;
    own.worst = Math.max(own.worst, size);
  }
};

const notePace = (paced: Paced, pace: number, now: number): void => {
  if (pace < 0.5) {
    paced.pausedFrames += 1;
    const second = Math.floor(now / 1000);
    if (paced.pausedSeconds.at(-1) !== second) {
      paced.pausedSeconds.push(second);
    }
  }
};

const drawIf = (
  drawn: Drawn,
  view:
    | { after: Pose; before: Pose; drawn: DrawnPlace; drift: RiderDrift }
    | undefined,
  path: OwnPath | undefined,
  rider: { mode: string; speed: number } | undefined,
  blend: number,
  measured: boolean
): void => {
  if (view && path && rider) {
    drawFrame(drawn, view, path, rider, blend, measured);
  }
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
  const own: OwnCorrections = { count: 0, total: 0, worst: 0 };
  const paced: Paced = { frozenFrames: 0, pausedFrames: 0, pausedSeconds: [] };
  const capture = (into: "after" | "before") => {
    const taken = client.takeCorrections();
    for (const moved of taken) {
      tallyOwn(own, moved);
      const path = riderOf(paths, moved.rider);
      if (path) {
        path.jumpedS += moved.s;
        path.jumpedX += moved.x;
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
  let stepsThisFrame = 0;
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
      stepsThisFrame += steps;
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
    () => {
      const pace = clock.pace(client.predicted.tick, now);
      notePace(paced, pace, now);
      return pace;
    }
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
  for (now = 0; now < (race.rideMs ?? RIDE_MS); now += FRAME_MS) {
    stepsThisFrame = 0;
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
    paced.frozenFrames +=
      stepsThisFrame === 0 && now >= SETTLED_AFTER_MS ? 1 : 0;
    const blend = fixed.accumulator / TICK_SECONDS;
    const myBike = riderOf(client.predicted.riders, ME);
    const theirBike = riderOf(client.predicted.riders, RIVAL);
    const measured = now >= SETTLED_AFTER_MS;
    drawIf(me, mine, myPath, myBike, blend, measured);
    drawIf(rival, theirs, theirPath, theirBike, blend, measured);
  }
  return {
    jumps: client.stats.jumps,
    me,
    missedInStall: room.missedControls(ME) - missedBefore,
    own,
    paced,
    refused: client.stats.refusedPredictions,
    rival,
  };
};

const BASE_OWN_JUMP_METRES = 18.7;
const STALL_MS = 2500;
const STALLS = 3;
const PAUSED_PER_STALL_FRAMES = ((STALL_MS - 1000) / FRAME_MS) * 1.2;

describe("the lagged rider's own bike", () => {
  it("eases to a stop when the room goes quiet, so a player braking through a 2.5 s two-way stall every 15 s is corrected by less than half of what main's frozen client took, and never refused a prediction", () => {
    const screen = rideOnScreen({
      brakesFrom: 15_000,
      downMs: stalledEvery(90, 60, 15_000, STALL_MS, 1),
      rideMs: 50_000,
      upMs: stalledEvery(90, 60, 15_000, STALL_MS, 2),
    });
    expect({
      ownJump: screen.jumps.ownControl.worstMetres < BASE_OWN_JUMP_METRES / 2,
      paused:
        screen.paced.pausedFrames > 0 &&
        screen.paced.pausedFrames <= STALLS * PAUSED_PER_STALL_FRAMES,
      refused: screen.refused,
      stepped: screen.me.worstStep < BIKE_WIDTH,
    }).toStrictEqual({
      ownJump: true,
      paused: true,
      refused: 0,
      stepped: true,
    });
  });
});

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
      100,
    ],
    [
      "a 1.5 s cut both ways",
      { downMs: cutFor(80, 1.5), upMs: cutFor(80, 1.5) },
      100,
    ],
    [
      "a 2.5 s cut both ways",
      { downMs: cutFor(80, 2.5), upMs: cutFor(80, 2.5) },
      160,
    ],
    [
      "a 4 s hold on ticks from the room",
      { downMs: cutFor(80, 4), upMs: steadyMs(80) },
      190,
    ],
    [
      "a room that stops stepping for 2.5 s",
      { downMs: steadyMs(80), roomStallsMs: 2500, upMs: steadyMs(80) },
      100,
    ],
  ] as const)(
    "draws each bike within its pace and glide limits every frame over %s, never leaving its own path faster than a glide, and the room misses only the controls the link lost or the paused client never sent",
    (_name, race, mostMissed) => {
      const screen = rideOnScreen(race);
      expect(screen.me.frames).toBeGreaterThan(1200);
      expect({
        beyondReach:
          Math.max(screen.me.beyondReach, screen.rival.beyondReach) <=
          MOST_BEYOND_REACH_FRAMES,
        glided:
          Math.max(screen.me.worstGlide, screen.rival.worstGlide) <
          FRAME_SLACK_METRES,
        off:
          Math.max(screen.me.worstOff, screen.rival.worstOff) <
          FRAME_SLACK_METRES,
        stepped:
          Math.max(screen.me.worstStep, screen.rival.worstStep) < BIKE_WIDTH,
      }).toStrictEqual({
        beyondReach: true,
        glided: true,
        off: true,
        stepped: true,
      });
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
        beyondReach:
          Math.max(screen.me.beyondReach, screen.rival.beyondReach) <=
          MOST_BEYOND_REACH_FRAMES,
        glided:
          Math.max(screen.me.worstGlide, screen.rival.worstGlide) <
          FRAME_SLACK_METRES,
        off:
          Math.max(screen.me.worstOff, screen.rival.worstOff) <
          FRAME_SLACK_METRES,
        stepped:
          Math.max(screen.me.worstStep, screen.rival.worstStep) < BIKE_WIDTH,
      }).toStrictEqual({
        beyondReach: true,
        glided: true,
        off: true,
        stepped: true,
      });
    }
  );
});
