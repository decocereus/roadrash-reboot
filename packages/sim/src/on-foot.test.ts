import { vergeHalfWidthAt } from "@racer/track/districts";
import { describe, expect, it } from "vitest";

import {
  KMH,
  onlyCop,
  controlsOf,
  cruising,
  field,
  frameOf,
  patrolFrom,
  player,
  rivalNamed,
  straight,
} from "./race-fixtures.ts";
import { createRace, defaultSetup, neutralInput, stepRace } from "./race.ts";
import { TICK_RATE } from "./state.ts";
import type {
  InputFrame,
  RaceEvent,
  RaceState,
  RiderInput,
  RiderState,
} from "./state.ts";

const knockedOffAndRunning = () => {
  const state = field(straight, 1, 1, 0);
  const me = player(state);
  const rival = rivalNamed(state, "dee-santangelo");
  rival.s = 900;
  me.s = 100;
  me.x = -1.8;
  me.speed = 30 / KMH;
  me.stamina = 0;
  for (
    let tick = 0;
    tick < 10 * TICK_RATE && me.mode !== "running";
    tick += 1
  ) {
    stepRace(state, straight, frameOf(state, [rival.id, cruising]));
  }
  expect(me.mode).toBe("running");
  return { me, rival, state };
};

const untilOnFeetAgain = (
  state: RaceState,
  me: RiderState,
  frame: InputFrame
) => {
  const events: RaceEvent[] = [];
  let ticksDown = -1;
  for (let tick = 0; tick < 10 * TICK_RATE; tick += 1) {
    stepRace(state, straight, frame);
    events.push(...state.events);
    if (ticksDown < 0 && me.mode === "thrown") {
      ticksDown = 0;
    } else if (ticksDown >= 0 && me.mode !== "running") {
      ticksDown += 1;
    } else if (ticksDown >= 0) {
      break;
    }
  }
  return { events, ticksDown };
};

describe("knocked down on foot", () => {
  it("a rider running back to the bike who is hit by a car goes down again and is back on their feet about two seconds later", () => {
    const { me, rival, state } = knockedOffAndRunning();
    state.cars.push({
      carrier: false,
      cruiseSpeed: 20,
      halfLength: 2.2,
      halfWidth: 0.92,
      height: 1.45,
      home: me.bodyX,
      paint: 2,
      patience: 120,
      s: me.bodyS - 2.2,
      speed: 20,
      waited: 0,
      x: me.bodyX,
    });
    const { events, ticksDown } = untilOnFeetAgain(
      state,
      me,
      frameOf(state, [rival.id, cruising])
    );
    expect(events).toContainEqual(
      expect.objectContaining({ by: null, kind: "knockedDown", rider: me.id })
    );
    expect({
      crashed: events.some((event) => event.kind === "crash"),
      crashes: me.crashes,
      mode: me.mode,
    }).toStrictEqual({ crashed: false, crashes: 1, mode: "running" });
    expect(ticksDown / TICK_RATE).toBeGreaterThan(1.2);
    expect(ticksDown / TICK_RATE).toBeLessThan(2.5);
  });

  it("a rider on foot who is run over by a rival is put down to that rival, and the rival only loses a little speed", () => {
    const { me, rival, state } = knockedOffAndRunning();
    rival.s = me.bodyS - 1.5;
    rival.x = me.bodyX;
    rival.speed = 25;
    const { events } = untilOnFeetAgain(
      state,
      me,
      frameOf(state, [rival.id, cruising])
    );
    expect(events).toContainEqual(
      expect.objectContaining({
        by: rival.id,
        kind: "knockedDown",
        rider: me.id,
      })
    );
    expect(events).toContainEqual({ kind: "bump", rider: rival.id });
    expect(rival.mode).toBe("riding");
    expect(rival.speed).toBeGreaterThan(18);
    expect(me.lastHitBy).toBe(1);
  });
});

const awayFromTheBike = (rider: RiderState): RiderInput => {
  const gapS = rider.s - rider.bodyS;
  const gapX = rider.x - rider.bodyX;
  const distance = Math.max(1e-6, Math.hypot(gapS, gapX));
  return {
    ...neutralInput,
    brake: Math.max(0, gapS / distance),
    steer: -gapX / distance,
    throttle: Math.max(0, -gapS / distance),
  };
};

const thrownWhileHolding = (held: RiderInput) => {
  const state = field(straight, 1, 1, 0);
  const me = player(state);
  const rival = rivalNamed(state, "dee-santangelo");
  rival.s = 900;
  me.s = 100;
  me.x = -1.8;
  me.speed = 30 / KMH;
  me.stamina = 0;
  for (
    let tick = 0;
    tick < 10 * TICK_RATE && me.mode !== "running";
    tick += 1
  ) {
    stepRace(
      state,
      straight,
      frameOf(state, [me.id, held], [rival.id, cruising])
    );
  }
  expect(me.mode).toBe("running");
  return { me, state };
};

const onFoot = (
  state: RaceState,
  me: RiderState,
  seconds: number,
  inputFor: (rider: RiderState) => RiderInput
) => {
  const from = { s: me.bodyS, x: me.bodyX };
  const bike = { s: me.s, x: me.x };
  const events: RaceEvent[] = [];
  for (let tick = 0; tick < seconds * TICK_RATE; tick += 1) {
    stepRace(
      state,
      straight,
      frameOf(
        state,
        [me.id, inputFor(me)],
        [rivalNamed(state, "dee-santangelo").id, cruising]
      )
    );
    events.push(...state.events);
  }
  const gap = (s: number, x: number) => Math.hypot(bike.s - s, bike.x - x);
  return {
    events,
    from,
    gapAtEnd: gap(me.bodyS, me.bodyX),
    gapAtStart: gap(from.s, from.x),
    moved: Math.hypot(me.bodyS - from.s, me.bodyX - from.x),
    remounted: events.some((event) => event.kind === "remount"),
  };
};

const towardIt = (rider: RiderState): RiderInput => {
  const gapS = rider.s - rider.bodyS;
  const gapX = rider.x - rider.bodyX;
  const distance = Math.max(1e-6, Math.hypot(gapS, gapX));
  return {
    ...neutralInput,
    brake: Math.max(0, -gapS / distance),
    steer: gapX / distance,
    throttle: Math.max(0, gapS / distance),
  };
};

const tumblingFrom = (kmh: number) => {
  const state = field(straight, 1, 1, 0);
  const me = player(state);
  const rival = rivalNamed(state, "dee-santangelo");
  rival.s = 900;
  me.s = 100;
  me.x = 0;
  me.speed = kmh / KMH;
  me.stamina = 0;
  return { me, rival, state };
};

const wipeOut = (kmh: number, held: RiderInput) => {
  const { me, rival, state } = tumblingFrom(kmh);
  stepRace(
    state,
    straight,
    frameOf(state, [me.id, held], [rival.id, cruising])
  );
  expect(me.mode).toBe("thrown");
  while (me.mode === "thrown") {
    stepRace(
      state,
      straight,
      frameOf(state, [me.id, held], [rival.id, cruising])
    );
  }
  return { travelled: me.bodyS - 100, x: me.bodyX };
};

describe("the tumble", () => {
  it("a rider thrown at 200 km/h stops within about seventy metres, not the hundred or two they used to", () => {
    expect(wipeOut(200, neutralInput).travelled).toBeLessThan(70);
  });

  it("A and D held from before the crash carry the rider across the road, each way", () => {
    const left = wipeOut(100, { ...neutralInput, steer: -1 });
    const right = wipeOut(100, { ...neutralInput, steer: 1 });
    const none = wipeOut(100, neutralInput);
    expect(right.x - none.x).toBeGreaterThan(4);
    expect(none.x - left.x).toBeGreaterThan(4);
  });

  it("S held from before the crash cuts the slide short", () => {
    const braked = wipeOut(160, { ...neutralInput, brake: 1 });
    const free = wipeOut(160, neutralInput);
    expect(braked.travelled).toBeLessThan(free.travelled - 5);
  });
});

describe("on foot", () => {
  it("a rider who presses E once runs to the bike by themselves and climbs on, and the bike has not moved", () => {
    const { me, state } = knockedOffAndRunning();
    const bike = { s: me.s, x: me.x };
    let presses = 1;
    const run = onFoot(state, me, 6, () => {
      presses -= 1;
      return { ...neutralInput, remount: presses === 0 };
    });
    expect(run.gapAtStart).toBeGreaterThan(2);
    expect(run.remounted).toBeTruthy();
    expect(me.mode).toBe("riding");
    expect(Math.abs(me.s - bike.s)).toBeLessThan(0.01);
    expect(Math.abs(me.x - bike.x)).toBeLessThan(0.01);
  });

  it("a rider who runs the other way gets further from the bike at about seven metres a second and does not remount", () => {
    const { me, state } = knockedOffAndRunning();
    const run = onFoot(state, me, 3, awayFromTheBike);
    expect(run.remounted).toBeFalsy();
    expect(me.mode).toBe("running");
    expect(run.gapAtEnd).toBeGreaterThan(run.gapAtStart + 15);
    expect(run.moved).toBeLessThan(3 * 7);
  });

  it("a rider who touches nothing stands where they got up and stays there", () => {
    const { me, state } = knockedOffAndRunning();
    const waiting = onFoot(state, me, 8, () => neutralInput);
    expect(waiting.moved).toBe(0);
    expect(waiting.remounted).toBeFalsy();
    expect(me.mode).toBe("running");
  });

  it("a rider steered onto the bike without E walks through it and does not get on", () => {
    const { me, state } = knockedOffAndRunning();
    let closest = Number.POSITIVE_INFINITY;
    let remounted = false;
    for (let tick = 0; tick < 6 * TICK_RATE; tick += 1) {
      remounted ||= onFoot(state, me, 1 / TICK_RATE, towardIt).remounted;
      closest = Math.min(closest, Math.hypot(me.s - me.bodyS, me.x - me.bodyX));
    }
    expect(closest).toBeLessThan(0.7);
    expect(remounted).toBeFalsy();
    expect(me.mode).toBe("running");
  });

  it("E pressed during the fall still takes the rider to the bike, and no key steers them off the way", () => {
    const { me, state } = thrownWhileHolding({
      ...neutralInput,
      remount: true,
    });
    expect(me.runningToBike).toBeTruthy();
    const against = { ...awayFromTheBike(me), kick: false };
    const run = onFoot(state, me, 8, () => against);
    expect(run.remounted).toBeTruthy();
    expect(me.mode).toBe("riding");
    expect(me.runningToBike).toBeFalsy();
  });

  it("the run still costs its time at seven metres a second, and the climb takes half a second more", () => {
    const { me, state } = knockedOffAndRunning();
    const metres = Math.hypot(me.s - me.bodyS, me.x - me.bodyX);
    let ticks = 0;
    while (me.mode !== "riding" && ticks < 20 * TICK_RATE) {
      onFoot(state, me, 1 / TICK_RATE, () => ({
        ...neutralInput,
        remount: true,
      }));
      ticks += 1;
    }
    expect(me.mode).toBe("riding");
    expect(ticks / TICK_RATE).toBeGreaterThan((metres - 0.7) / 7 + 0.5);
  });

  it("a rider running to the bike can still be hit by traffic, and carries on to the bike without pressing E again", () => {
    const { me, state } = knockedOffAndRunning();
    onFoot(state, me, 1 / TICK_RATE, () => ({
      ...neutralInput,
      remount: true,
    }));
    state.cars.push({
      carrier: false,
      cruiseSpeed: 20,
      halfLength: 2.2,
      halfWidth: 0.92,
      height: 1.45,
      home: me.bodyX,
      paint: 0,
      patience: 120,
      s: me.bodyS - 3,
      speed: 20,
      waited: 0,
      x: me.bodyX,
    });
    const hit = onFoot(state, me, 0.5, () => neutralInput);
    expect(hit.events).toContainEqual(
      expect.objectContaining({ kind: "knockedDown", rider: me.id })
    );
    state.cars.pop();
    const run = onFoot(state, me, 10, () => neutralInput);
    expect(run.remounted).toBeTruthy();
    expect(me.mode).toBe("riding");
  });

  it("a rider still holding the throttle when they are thrown does not run off; the rider moves only once the key has been released and pressed again", () => {
    const held = { ...neutralInput, throttle: 1 };
    const { me, state } = thrownWhileHolding(held);
    const stillHeld = onFoot(state, me, 2, () => held);
    expect(stillHeld.moved).toBe(0);
    expect(me.mode).toBe("running");
    onFoot(state, me, 0.1, () => neutralInput);
    const pressedAgain = onFoot(state, me, 1, () => held);
    expect(pressedAgain.moved).toBeGreaterThan(4);
    expect(me.bodyS).toBeGreaterThan(stillHeld.from.s + 4);
  });

  it("a key that was not held at the fall works at once while a held one is still dead", () => {
    const held = { ...neutralInput, throttle: 1 };
    const { me, state } = thrownWhileHolding(held);
    const from = { s: me.bodyS, x: me.bodyX };
    onFoot(state, me, 1, () => ({ ...held, steer: 1 }));
    expect(me.bodyX).toBeGreaterThan(from.x + 4);
    expect(Math.abs(me.bodyS - from.s)).toBeLessThan(0.01);
  });

  it("a rider handed to the pilot while running beside the bike with the steer and throttle still held from the fall runs back and rides again", () => {
    const held = { ...neutralInput, steer: 1, throttle: 1 };
    const { me, state } = thrownWhileHolding(held);
    const stillHeld = onFoot(state, me, 1, () => held);
    expect(stillHeld.moved).toBe(0);
    me.bodyX = me.x + 3.5;
    me.bodyS = me.s + 0.01;
    const rival = rivalNamed(state, "dee-santangelo");
    const frame = controlsOf([rival.id, cruising]);
    stepRace(state, straight, {
      ...frame,
      handovers: new Map([[me.id, "pilot"]]),
    });
    const events: RaceEvent[] = [];
    for (let tick = 0; tick < 10 * TICK_RATE; tick += 1) {
      stepRace(state, straight, frame);
      events.push(...state.events);
    }
    expect(events.map((event) => event.kind)).toContain("remount");
    expect(me.mode).toBe("riding");
  });

  it("a rider on foot cannot leave the verge or walk through the finish", () => {
    const { me, state } = knockedOffAndRunning();
    const sideways = { ...neutralInput, steer: -1 };
    onFoot(state, me, 4, () => sideways);
    expect(me.bodyX).toBe(-vergeHalfWidthAt(straight, 0));
    me.bodyS = straight.length - 5;
    const forward = { ...neutralInput, throttle: 1 };
    onFoot(state, me, 3, () => forward);
    expect(me.bodyS).toBe(straight.length);
    expect(me.finishTick).toBe(-1);
  });

  it("a rival knocked off runs back to their bike and remounts on their own", () => {
    const state = field(straight, 1, 1, 0);
    const me = player(state);
    const rival = rivalNamed(state, "dee-santangelo");
    me.s = 900;
    rival.s = 100;
    rival.speed = 20;
    rival.stamina = 0;
    rival.controller = "pilot";
    const events: RaceEvent[] = [];
    const modes: string[] = [];
    for (let tick = 0; tick < 10 * TICK_RATE; tick += 1) {
      stepRace(state, straight, frameOf(state));
      events.push(...state.events);
      if (modes.at(-1) !== rival.mode) {
        modes.push(rival.mode);
      }
    }
    expect(modes).toStrictEqual([
      "thrown",
      "lying",
      "running",
      "mounting",
      "riding",
    ]);
    expect(events).toContainEqual({ kind: "remount", rider: rival.id });
    expect(rival.speed).toBeGreaterThan(5);
  });

  it("a cop reaching a rider who is standing on foot arrests them", () => {
    const state = createRace({ ...defaultSetup(straight, 1), rivals: [] });
    const me = player(state);
    patrolFrom(onlyCop(state), 100);
    me.s = 200;
    me.speed = 10;
    me.stamina = 0;
    const events: RaceEvent[] = [];
    for (
      let tick = 0;
      tick < 15 * TICK_RATE && me.mode !== "busted";
      tick += 1
    ) {
      stepRace(state, straight, frameOf(state));
      events.push(...state.events);
    }
    expect(events.map((event) => event.kind)).not.toContain("remount");
    expect(me.mode).toBe("busted");
  });
});
