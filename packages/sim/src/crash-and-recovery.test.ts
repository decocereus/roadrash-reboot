import type { Track } from "@racer/track/track";
import { describe, expect, it } from "vitest";

import {
  KMH,
  brawl,
  cruising,
  field,
  hold,
  player,
  pressing,
  quietTrack,
  rivalIn,
  sideBySide,
  straight,
  towardTheBike,
  track,
} from "./race-fixtures.ts";
import { neutralInput, standings, stepRace } from "./race.ts";
import { FULL_CONDITION, TICK_RATE } from "./state.ts";
import type { RaceEvent, RaceState, RiderInput, RiderState } from "./state.ts";

const holdAndRunBack = (
  state: RaceState,
  course: Track,
  input: RiderInput,
  seconds: number
): RaceEvent[] => {
  const events: RaceEvent[] = [];
  for (let tick = 0; tick < seconds * TICK_RATE; tick += 1) {
    stepRace(state, course, [towardTheBike(player(state), input)]);
    events.push(...state.events);
  }
  return events;
};

const crashIntoPole = (kmh: number) => {
  const state = field(quietTrack, 1, 0, 0);
  const rider = player(state);
  const pole = quietTrack.solidProps.find(
    (prop) => prop.s > 300 && Math.abs(prop.x) < quietTrack.vergeHalfWidth - 0.5
  );
  if (!pole) {
    throw new Error("The road has no pole beside it.");
  }
  rider.s = pole.s - 15;
  rider.x = pole.x;
  rider.speed = kmh / KMH;
  const order: string[] = [];
  let crashTick = -1;
  let slidingSeconds = -1;
  let onFeetSeconds = -1;
  let remountSeconds = -1;
  for (let tick = 0; tick < 20 * TICK_RATE && remountSeconds < 0; tick += 1) {
    stepRace(state, quietTrack, [towardTheBike(rider, neutralInput)]);
    if (order.at(-1) !== rider.mode) {
      order.push(rider.mode);
    }
    if (crashTick < 0 && rider.mode === "thrown") {
      crashTick = tick;
    }
    const since = (tick - crashTick) / TICK_RATE;
    if (crashTick >= 0 && rider.mode === "lying" && slidingSeconds < 0) {
      slidingSeconds = since;
    }
    if (crashTick >= 0 && rider.mode === "running" && onFeetSeconds < 0) {
      onFeetSeconds = since;
    }
    if (crashTick >= 0 && rider.mode === "riding") {
      remountSeconds = since;
    }
  }
  return {
    onFeetSeconds,
    order: order.filter((mode) => mode !== "riding" && mode !== "mounting"),
    remountSeconds,
    slidingSeconds,
  };
};

describe("crashing", () => {
  it("a head-on hit throws the rider, who runs back and rides again", () => {
    const state = field(track, 7, 0, 0);
    const rider = player(state);
    const oncoming = state.cars.find((car) => car.speed < 0 && car.s > 400);
    if (!oncoming) {
      throw new Error("The race has no oncoming traffic.");
    }
    rider.s = oncoming.s - 60;
    rider.x = oncoming.x;
    rider.speed = 35;
    const events = hold(
      state,
      track,
      { brake: 0, kick: false, punch: false, steer: 0, throttle: 0 },
      1.5
    );
    expect(events.map((event) => event.kind)).toContain("crash");
    expect(rider.mode).toBe("thrown");
    expect(rider.bodyS).toBeGreaterThan(rider.s);

    const later = holdAndRunBack(
      state,
      track,
      { brake: 0, kick: false, punch: false, steer: 0, throttle: 0 },
      14
    );
    expect(later.map((event) => event.kind)).toContain("remount");
    expect(rider.mode).toBe("riding");
  });

  it("a rider thrown into a pole at 160 km/h tumbles and slides for over four and a half seconds, lies still, and is on their feet about five and a half seconds after the impact; a fall at 50 km/h is over in half the time and a rider who runs straight back is riding again within five and a half seconds", () => {
    const fast = crashIntoPole(160);
    const slow = crashIntoPole(50);
    expect({
      onFeetAboutFiveAndAHalf: fast.onFeetSeconds > 5 && fast.onFeetSeconds < 6,
      order: fast.order,
      slidesOverFourAndAHalf: fast.slidingSeconds > 4.5,
    }).toStrictEqual({
      onFeetAboutFiveAndAHalf: true,
      order: ["thrown", "lying", "running"],
      slidesOverFourAndAHalf: true,
    });
    expect(slow.onFeetSeconds).toBeLessThan(fast.onFeetSeconds / 2);
    expect(slow.remountSeconds).toBeLessThan(5.5);
  });

  it("riding into the trees ends in a crash", () => {
    const state = field(quietTrack, 1, 0, 0);
    const rider = player(state);
    rider.s = 100;
    rider.speed = 30;
    const events = hold(
      state,
      quietTrack,
      { brake: 0, kick: false, punch: false, steer: 1, throttle: 1 },
      6
    );
    expect(events.map((event) => event.kind)).toContain("crash");
  });

  it("a gentle head-on bump permits a throttle-and-steer escape", () => {
    const state = field(straight, 1, 0, 0);
    const me = player(state);
    Object.assign(me, { bodyS: 100, bodyX: -1.8, s: 100, speed: 2, x: -1.8 });
    const car = {
      cruiseSpeed: -22,
      halfLength: 2.2,
      halfWidth: 0.92,
      height: 1.45,
      paint: 2,
      s: 103.1,
      speed: -3,
      x: -1.8,
    };
    state.cars.push(car);
    let stoppedTicks = 0;
    let longestStop = 0;
    for (let tick = 0; tick < 4 * TICK_RATE; tick += 1) {
      stepRace(state, straight, [
        { ...cruising, steer: me.x < 0 ? 1 : 0, throttle: 1 },
      ]);
      stoppedTicks =
        me.mode === "riding" && me.speed < 0.5 ? stoppedTicks + 1 : 0;
      longestStop = Math.max(longestStop, stoppedTicks);
    }
    expect(me.mode).toBe("riding");
    expect(longestStop).toBeLessThanOrEqual(1.5 * TICK_RATE);
    expect(me.s).toBeGreaterThan(car.s + 20);
  });
});

describe("recovering", () => {
  it("a rider punched onto the outside grass of a bend at 80 km/h rolls off and steers back onto the road within two seconds", () => {
    const state = field(quietTrack, 1, 1, 0);
    const me = player(state);
    const rival = rivalIn(state);
    me.s = 1550;
    me.speed = 22;
    rival.speed = 22;
    rival.weapon = "none";
    const back = { ...cruising, steer: -1, throttle: 0 };
    let punched = -1;
    let onRoad = -1;
    for (let tick = 0; tick < 4 * TICK_RATE && onRoad < 0; tick += 1) {
      if (punched < 0) {
        me.x = quietTrack.roadHalfWidth + 0.5;
        me.lateralSpeed = 0;
        rival.x = me.x - 1.5;
        rival.s = me.s;
      }
      const rivalInput =
        punched < 0
          ? { ...cruising, punch: true, throttle: 0.6 }
          : { ...cruising, brake: 1, throttle: 0 };
      stepRace(state, quietTrack, [punched < 0 ? cruising : back, rivalInput]);
      if (punched < 0 && state.events.some((event) => event.kind === "hit")) {
        punched = tick;
      }
      if (punched >= 0 && Math.abs(me.x) < quietTrack.roadHalfWidth) {
        onRoad = tick;
      }
    }
    expect(punched).toBeGreaterThanOrEqual(0);
    expect(me.mode).toBe("riding");
    expect(onRoad).toBeGreaterThanOrEqual(0);
    expect((onRoad - punched) / TICK_RATE).toBeLessThan(2);
  });
});

const headOn = (
  state: RaceState,
  rider: RiderState,
  speed = 56,
  ahead = 8
): RaceEvent[] => {
  const [car] = state.cars;
  if (!car) {
    throw new Error("The race has no car.");
  }
  car.s = rider.s + ahead;
  car.speed = car.cruiseSpeed;
  rider.x = car.x;
  rider.speed = speed;
  const events: RaceEvent[] = [];
  for (let tick = 0; tick < 30 * TICK_RATE; tick += 1) {
    stepRace(state, straight, [
      towardTheBike(rider, { ...cruising, throttle: 1 }),
    ]);
    events.push(...state.events);
    const down = events.some((event) => event.kind === "crash");
    if (down && (rider.mode === "riding" || rider.parked)) {
      break;
    }
  }
  return events;
};

const oncomingCar = (state: RaceState): void => {
  state.cars.push({
    cruiseSpeed: -22,
    halfLength: 2.2,
    halfWidth: 0.92,
    height: 1.45,
    paint: 2,
    s: 0,
    speed: -22,
    x: -1.8,
  });
};

const knockedOffAt = (kmh: number): number => {
  const state = field(straight, 1, 0, 0);
  const me = player(state);
  me.s = 100;
  me.speed = kmh / KMH;
  me.stamina = 0;
  stepRace(state, straight, [cruising]);
  return FULL_CONDITION - me.condition;
};

const headOnAt = (kmh: number): number => {
  const state = field(straight, 1, 0, 0);
  const me = player(state);
  me.s = 100;
  oncomingCar(state);
  headOn(state, me, kmh / KMH, 8);
  return FULL_CONDITION - me.condition;
};

const crashesToWreck = (crash: (state: RaceState) => void): number => {
  const state = field(straight, 1, 0, 0);
  const me = player(state);
  me.s = 100;
  oncomingCar(state);
  while (me.mode !== "wrecked" && me.crashes < 20) {
    crash(state);
  }
  return me.crashes;
};

const knockOffAndRemount = (state: RaceState, kmh: number): void => {
  const me = player(state);
  me.speed = kmh / KMH;
  me.stamina = 0;
  const [car] = state.cars;
  if (car) {
    car.s = me.s - 400;
  }
  for (let tick = 0; tick < 20 * TICK_RATE; tick += 1) {
    stepRace(state, straight, [towardTheBike(me, cruising)]);
    if (me.mode === "riding" || me.mode === "wrecked") {
      break;
    }
  }
};

describe("bike condition", () => {
  it("a crash at 200 km/h costs about 30% of the bike, one at 100 km/h about 15%, and a tip-over at walking pace almost nothing", () => {
    expect({
      headOn: [100, 200].map((kmh) => Math.round(headOnAt(kmh))),
      knockdown: [10, 60, 100, 150, 200].map((kmh) =>
        Math.round(knockedOffAt(kmh))
      ),
    }).toStrictEqual({
      headOn: [17, 34],
      knockdown: [3, 8, 14, 21, 28],
    });
  });

  it("three or four hard crashes wreck a bike, and it takes about twice as many at half the speed", () => {
    expect({
      knockdownsAt100: crashesToWreck((state) => {
        knockOffAndRemount(state, 100);
      }),
      knockdownsAt200: crashesToWreck((state) => {
        knockOffAndRemount(state, 200);
      }),
      trafficAt160: crashesToWreck((state) => {
        headOn(state, player(state), 160 / KMH, 8);
      }),
      trafficAt200: crashesToWreck((state) => {
        headOn(state, player(state), 200 / KMH, 8);
      }),
    }).toStrictEqual({
      knockdownsAt100: 8,
      knockdownsAt200: 4,
      trafficAt160: 4,
      trafficAt200: 3,
    });
  });

  it("three hard traffic crashes wreck the bike and the rider is placed after everyone else", () => {
    const state = field(straight, 1, 2, 0);
    const me = player(state);
    const finisher = rivalIn(state);
    finisher.s = straight.length - 20;
    finisher.speed = 30;
    me.s = 100;
    oncomingCar(state);
    const conditions: number[] = [];
    const kinds: string[] = [];
    for (let crash = 0; crash < 3; crash += 1) {
      kinds.push(...headOn(state, me).map((event) => event.kind));
      conditions.push(me.condition);
    }
    expect(conditions[0]).toBeLessThan(70);
    expect(conditions.slice(1).map((left) => left > 0)).toStrictEqual([
      true,
      false,
    ]);
    expect(
      ["crash", "remount", "wrecked"].map(
        (wanted) => kinds.filter((kind) => kind === wanted).length
      )
    ).toStrictEqual([3, 2, 1]);
    expect({
      finished: finisher.finishTick >= 0,
      mode: me.mode,
      offTheRoad: Math.abs(me.x) > straight.roadHalfWidth,
    }).toStrictEqual({ finished: true, mode: "wrecked", offTheRoad: true });
    expect(standings(state)).toStrictEqual([
      finisher.id,
      rivalIn(state, 1).id,
      me.id,
    ]);
  });

  it("the traffic drives on past a wreck that has come to rest", () => {
    const state = field(straight, 1, 0, 0);
    const me = player(state);
    me.s = 100;
    me.condition = 1;
    state.cars.push({
      cruiseSpeed: -22,
      halfLength: 2.2,
      halfWidth: 0.92,
      height: 1.45,
      paint: 2,
      s: 0,
      speed: -22,
      x: -1.8,
    });
    headOn(state, me);
    const [car] = state.cars;
    hold(state, straight, cruising, 6);
    expect(me.mode).toBe("wrecked");
    expect(Math.abs(car?.speed ?? 0)).toBeGreaterThan(20);
  });
});

const knockedOffTrack = (ticksAfterPunch: number) => {
  const { moose, me, state } = sideBySide();
  const crashes: RaceEvent[] = [];
  let punchedAt = -1;
  for (let tick = 0; tick < 3 * TICK_RATE && crashes.length === 0; tick += 1) {
    me.x = 0.3;
    moose.s = me.s;
    moose.x =
      punchedAt >= 0 && state.tick + 1 === punchedAt + ticksAfterPunch
        ? straight.vergeHalfWidth + 1
        : 1.8;
    stepRace(state, straight, [
      pressing("punch", tick === 0),
      cruising,
      cruising,
    ]);
    if (state.events.some((event) => event.kind === "hit")) {
      punchedAt = state.tick;
    }
    crashes.push(...state.events.filter((event) => event.kind === "crash"));
  }
  return { crashes, me, moose };
};

describe("crash attribution", () => {
  it("a crash within a second of a punch names the rider who threw it, and a later one names nobody", () => {
    const early = knockedOffTrack(60);
    expect(early.crashes).toMatchObject([
      { by: early.me.id, cause: "offTrack", rider: early.moose.id },
    ]);
    const late = knockedOffTrack(61);
    expect(late.crashes).toMatchObject([
      { by: null, cause: "offTrack", rider: late.moose.id },
    ]);
  });

  it("a rider knocked down by punches is put down to the puncher, and a rider who falls alone to nobody", () => {
    const { me, moose, state } = sideBySide();
    moose.stamina = 10;
    const fight = brawl(state, 1, (tick) => [
      pressing("punch", tick === 0),
      cruising,
      cruising,
    ]);
    expect(fight.filter((event) => event.kind === "crash")).toMatchObject([
      { by: me.id, cause: "combat", rider: moose.id },
    ]);

    const solo = field(quietTrack, 1, 0, 0);
    player(solo).s = 100;
    player(solo).speed = 30;
    const fall = hold(solo, quietTrack, { ...cruising, steer: 1 }, 6);
    expect(fall.filter((event) => event.kind === "crash")).toMatchObject([
      { by: null, rider: player(solo).id },
    ]);
  });
});
