import { hazardSizes } from "@racer/track/hazards";
import type { HazardPlacement } from "@racer/track/hazards";
import { compileTrack, curvatureAt } from "@racer/track/track";
import type { Track } from "@racer/track/track";
import { hollowPineRoad } from "@racer/track/tracks/hollow-pine-road";
import { ridgeRoad } from "@racer/track/tracks/ridge-road";
import { slagRow } from "@racer/track/tracks/slag-row";
import { describe, expect, it } from "vitest";

import { bikes, streetBike } from "./bikes.ts";
import { cast, rivalAt, rivals } from "./cast.ts";
import { topSpeedOf } from "./engine.ts";
import { spawnOil, spawnPothole, spawnRock } from "./hazards.ts";
import { pilotInput } from "./pilot.ts";
import { chaserDistance, PATROL_SPEED } from "./police.ts";
import {
  createRace,
  defaultPolice,
  defaultSetup,
  neutralInput,
  standings,
  stepRace,
  validateSetup,
} from "./race.ts";
import {
  BIKE_HALF_WIDTH,
  FULL_CONDITION,
  lateralSpeedLimit,
  MAX_STAMINA,
  TICK_RATE,
} from "./state.ts";
import type {
  BikeSpec,
  PacingRules,
  PoliceSetup,
  RaceEvent,
  RaceSetup,
  RaceState,
  RiderInput,
  RiderState,
  RivalSetup,
  WeaponKind,
} from "./state.ts";
import { arm, disarm } from "./weapons.ts";

const MPH = 2.237;
const KMH = 3.6;
const track = compileTrack(ridgeRoad);
const quietTrack = compileTrack({ ...ridgeRoad, trafficPerKilometre: 0 });
const wideTrack = compileTrack({ ...ridgeRoad, lanesEachWay: 2 });
const straight = compileTrack({
  ...ridgeRoad,
  features: [],
  sections: [{ climb: 0, length: 6000, turnDegrees: 0 }],
  trafficPerKilometre: 0,
});

const field = (
  course: Track,
  seed: number,
  rivalCount: number,
  copCount: number
): RaceState => {
  const setup = defaultSetup(course, seed);
  return createRace({
    ...setup,
    police: { ...setup.police, count: copCount },
    rivals: setup.rivals.slice(0, rivalCount),
  });
};

const cruising: RiderInput = {
  brake: 0,
  kick: false,
  punch: false,
  steer: 0,
  throttle: 0.5,
};

const riderAt = (state: RaceState, index: number) => {
  const rider = state.riders[index];
  if (!rider) {
    throw new Error(`The race has no rider ${index}.`);
  }
  return rider;
};

const player = (state: RaceState) => {
  const [rider] = state.riders;
  if (!rider) {
    throw new Error("The race has no rider.");
  }
  return rider;
};

const hold = (
  state: RaceState,
  course: Track,
  input: RiderInput,
  seconds: number
): RaceEvent[] => {
  const events: RaceEvent[] = [];
  for (let tick = 0; tick < seconds * TICK_RATE; tick += 1) {
    stepRace(state, course, [input]);
    events.push(...state.events);
  }
  return events;
};

const towardTheBike = (rider: RiderState, riding: RiderInput): RiderInput => {
  if (rider.mode !== "running") {
    return riding;
  }
  const gapS = rider.s - rider.bodyS;
  const gapX = rider.x - rider.bodyX;
  const distance = Math.max(1e-6, Math.hypot(gapS, gapX));
  return {
    ...riding,
    brake: Math.max(0, -gapS / distance),
    steer: gapX / distance,
    throttle: Math.max(0, gapS / distance),
  };
};

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

const alone = (course: Track, bike: BikeSpec): RaceState => {
  const setup = defaultSetup(course, 1);
  return createRace({
    ...setup,
    player: { ...setup.player, bike },
    police: { ...setup.police, count: 0 },
    rivals: [],
  });
};

const pilotUntilFinish = (
  state: RaceState,
  course: Track,
  limitSeconds: number
) => {
  const input: RiderInput = {
    brake: 0,
    kick: false,
    punch: false,
    steer: 0,
    throttle: 0,
  };
  const events: RaceEvent[] = [];
  for (let tick = 0; tick < limitSeconds * TICK_RATE; tick += 1) {
    pilotInput(state, course, 0, input);
    stepRace(state, course, [input]);
    events.push(...state.events);
    if (player(state).finishTick >= 0) {
      break;
    }
  }
  return events;
};

const brakeIntoBend = (brake: number) => {
  const state = field(quietTrack, 1, 0, 0);
  const rider = player(state);
  rider.s = 1520;
  rider.speed = 44;
  const input = { brake, kick: false, punch: false, steer: -1, throttle: 0 };
  for (let tick = 0; tick < 6 * TICK_RATE && rider.speed > 30; tick += 1) {
    stepRace(state, quietTrack, [input]);
  }
  return { distance: rider.s - 1520, mode: rider.mode };
};

const brakeAcrossBend = (brake: number): number => {
  const state = field(quietTrack, 1, 0, 0);
  const rider = player(state);
  rider.s = 1560;
  rider.x = -4;
  rider.speed = 50;
  hold(
    state,
    quietTrack,
    { brake, kick: false, punch: false, steer: 1, throttle: 0 },
    0.4
  );
  return rider.speed;
};

describe("riding", () => {
  it("the Sesta reaches 100 km/h in about three and a half seconds and tops out near 240 km/h tucked in", () => {
    const state = field(quietTrack, 1, 0, 0);
    const fullThrottle = {
      brake: 0,
      kick: false,
      punch: false,
      steer: 0,
      throttle: 1,
    };
    hold(state, quietTrack, fullThrottle, 3);
    expect(player(state).speed * 3.6).toBeLessThan(100);
    hold(state, quietTrack, fullThrottle, 1);
    expect(player(state).speed * 3.6).toBeGreaterThan(100);

    const flat = compileTrack({
      ...ridgeRoad,
      features: [],
      sections: [{ climb: 0, length: 6000, turnDegrees: 0 }],
      trafficPerKilometre: 0,
    });
    const sprint = field(flat, 1, 0, 0);
    hold(sprint, flat, fullThrottle, 60);
    expect(player(sprint).speed * 3.6).toBeGreaterThan(232);
    expect(player(sprint).speed * 3.6).toBeLessThan(246);
  });

  it("the starter bike reaches 100 km/h in under four seconds and tops out between 190 and 202 km/h", () => {
    const state = alone(straight, bikes["halden-wren-400"]);
    const rider = player(state);
    const fullThrottle = { ...cruising, throttle: 1 };
    hold(state, straight, fullThrottle, 3.2);
    expect(rider.speed * KMH).toBeLessThan(100);
    hold(state, straight, fullThrottle, 0.8);
    expect(rider.speed * KMH).toBeGreaterThan(100);
    expect(rider.speed * MPH).toBeGreaterThan(60);
    hold(state, straight, fullThrottle, 56);
    expect(rider.speed * KMH).toBeGreaterThan(190);
    expect(rider.speed * KMH).toBeLessThan(202);
  });

  it("the starter bike rolls off the throttle: three quarters of its speed is left after three seconds and about half after seven", () => {
    const state = alone(straight, bikes["halden-wren-400"]);
    const rider = player(state);
    hold(state, straight, { ...cruising, throttle: 1 }, 60);
    const top = rider.speed;
    hold(state, straight, { ...cruising, throttle: 0 }, 3);
    expect(rider.speed).toBeLessThan(top * 0.8);
    expect(rider.speed).toBeGreaterThan(top * 0.68);
    hold(state, straight, { ...cruising, throttle: 0 }, 4);
    expect(rider.speed).toBeLessThan(top * 0.58);
    expect(rider.speed).toBeGreaterThan(top * 0.45);
  });

  it("the brakes take a fifth of a second to bite and then stop the starter bike from top speed in under two and a half seconds and 70 metres", () => {
    const state = alone(straight, bikes["halden-wren-400"]);
    const rider = player(state);
    hold(state, straight, { ...cruising, throttle: 1 }, 60);
    const top = rider.speed;
    const from = rider.s;
    const braking = { ...cruising, brake: 1, throttle: 0 };
    hold(state, straight, braking, 0.2);
    expect(rider.speed).toBeGreaterThan(top * 0.9);
    hold(state, straight, braking, 2.3);
    expect(rider.speed).toBe(0);
    expect(rider.s - from).toBeLessThan(70);
    expect(rider.s - from).toBeGreaterThan(50);
  });

  it("stops from 200 km/h in about 55 metres", () => {
    const flat = compileTrack({
      ...ridgeRoad,
      features: [],
      sections: [{ climb: 0, length: 6000, turnDegrees: 0 }],
      trafficPerKilometre: 0,
    });
    const state = field(flat, 1, 0, 0);
    const rider = player(state);
    rider.speed = 200 / 3.6;
    const from = rider.s;
    hold(
      state,
      flat,
      { brake: 1, kick: false, punch: false, steer: 0, throttle: 0 },
      8
    );
    expect(rider.speed).toBe(0);
    expect(rider.s - from).toBeLessThan(65);
    expect(rider.s - from).toBeGreaterThan(45);
  });

  it("a curve pushes a rider who does not steer to the outside", () => {
    const state = field(quietTrack, 1, 0, 0);
    const rider = player(state);
    rider.s = 300;
    rider.x = 0;
    rider.speed = 40;
    hold(
      state,
      quietTrack,
      { brake: 0, kick: false, punch: false, steer: 0, throttle: 0.6 },
      2.5
    );
    expect(rider.x).toBeLessThan(-1.5);
  });

  it("a third of lock holds the opening bend at 144 km/h", () => {
    const state = field(quietTrack, 1, 0, 0);
    const rider = player(state);
    rider.s = 300;
    rider.x = 0;
    rider.speed = 40;
    hold(
      state,
      quietTrack,
      { brake: 0, kick: false, punch: false, steer: 0.3, throttle: 0.6 },
      2.5
    );
    expect(Math.abs(rider.x)).toBeLessThan(1.5);
  });

  it("the bars take most of a second to reach full lock, so a lane change takes over a second", () => {
    const state = alone(straight, streetBike);
    const rider = player(state);
    rider.speed = 40;
    rider.x = 0;
    const steering = { ...cruising, steer: 1, throttle: 0.6 };
    hold(state, straight, steering, 0.25);
    expect(rider.x).toBeLessThan(0.3);
    hold(state, straight, steering, 0.75);
    expect(rider.x).toBeGreaterThan(2);
    expect(rider.x).toBeLessThan(3.2);
  });

  it("the bike carries on sideways for most of a second after the key lifts", () => {
    const flat = straight;
    const state = alone(flat, streetBike);
    const rider = player(state);
    rider.speed = 40;
    rider.x = 0;
    const steering = { ...cruising, steer: 1, throttle: 0.6 };
    hold(state, flat, steering, 1);
    const atRelease = rider.x;
    const released = { ...steering, steer: 0 };
    hold(state, flat, released, 0.5);
    expect(rider.x - atRelease).toBeGreaterThan(1);
    const afterHalfASecond = rider.x;
    hold(state, flat, released, 0.5);
    expect(rider.x - afterHalfASecond).toBeLessThan(0.5);
    expect(rider.x - atRelease).toBeLessThan(2.6);
    const atRest = rider.x;
    hold(state, flat, released, 0.5);
    expect(rider.x - atRest).toBeLessThan(0.01);
  });

  it("the tightest bend cannot be held flat out but can at a sane speed", () => {
    const flatOut = field(quietTrack, 1, 0, 0);
    const fast = player(flatOut);
    fast.s = 1520;
    fast.x = 1.8;
    fast.speed = 58;
    const events = hold(
      flatOut,
      quietTrack,
      { brake: 0, kick: false, punch: false, steer: -1, throttle: 1 },
      5
    );
    expect(
      fast.offRoad || events.some((event) => event.kind === "crash")
    ).toBeTruthy();

    const sane = field(quietTrack, 1, 0, 0);
    const steady = player(sane);
    steady.s = 1560;
    steady.x = 0;
    steady.speed = 32;
    hold(
      sane,
      quietTrack,
      { brake: 0, kick: false, punch: false, steer: -0.45, throttle: 0.3 },
      3
    );
    expect(steady.mode).toBe("riding");
    expect(Math.abs(steady.x)).toBeLessThan(quietTrack.roadHalfWidth);
  });

  it("the brakes still bite in the tightest bend whichever way the rider steers", () => {
    const braking = brakeIntoBend(1);
    const coasting = brakeIntoBend(0);
    expect([braking.mode, coasting.mode]).toStrictEqual(["riding", "riding"]);
    expect(braking.distance).toBeLessThan(coasting.distance * 0.7);
    expect(brakeAcrossBend(1)).toBeLessThan(brakeAcrossBend(0) - 1.2);
  });

  it("launches over the big crest at speed and lands without crashing", () => {
    const state = field(quietTrack, 1, 0, 0);
    const rider = player(state);
    rider.s = 2110;
    rider.speed = 53;
    const events = hold(
      state,
      quietTrack,
      { brake: 0, kick: false, punch: false, steer: 0, throttle: 1 },
      5
    );
    const flights = events.filter(
      (event) => event.kind === "land" && event.airSeconds > 0.5
    );
    expect(flights).toHaveLength(1);
    expect(events.some((event) => event.kind === "crash")).toBeFalsy();
  });

  it("stays on the ground over the same crest at a cruise", () => {
    const state = field(quietTrack, 1, 0, 0);
    const rider = player(state);
    rider.s = 2110;
    rider.speed = 30;
    const events = hold(
      state,
      quietTrack,
      { brake: 0, kick: false, punch: false, steer: 0, throttle: 0.2 },
      5
    );
    expect(events.some((event) => event.kind === "land")).toBeFalsy();
  });
});

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

describe("a full race", () => {
  it("the pilot finishes an empty Ridge Road cleanly in a sensible time", () => {
    const state = field(quietTrack, 1, 0, 0);
    const events = pilotUntilFinish(state, quietTrack, 240);
    const rider = player(state);
    expect(rider.finishTick).toBeGreaterThan(0);
    expect(rider.crashes).toBe(0);
    expect(events.some((event) => event.kind === "crash")).toBeFalsy();
    const seconds = rider.finishTick / TICK_RATE;
    expect(seconds).toBeGreaterThan(160);
    expect(seconds).toBeLessThan(195);
  });

  it("the pilot gets through traffic and still finishes", () => {
    const state = field(track, 11, 0, 0);
    pilotUntilFinish(state, track, 400);
    expect(player(state).finishTick).toBeGreaterThan(0);
  });

  it("replays identically from the same seed and inputs", () => {
    const first = field(track, 3, 0, 0);
    const second = field(track, 3, 0, 0);
    pilotUntilFinish(first, track, 60);
    pilotUntilFinish(second, track, 60);
    expect(second).toStrictEqual(first);
  });
});

const raceIsOver = (rider: RiderState): boolean =>
  rider.finishTick >= 0 || rider.mode === "busted" || rider.mode === "wrecked";

const raceThePack = (seed: number) => {
  const state = createRace(defaultSetup(track, seed));
  const racers = state.riders.filter((rider) => rider.profile.role === "racer");
  const inputs = state.riders.map(() => ({ ...cruising }));
  const events: RaceEvent[] = [];
  for (let tick = 0; tick < 300 * TICK_RATE; tick += 1) {
    for (const [index, input] of inputs.entries()) {
      pilotInput(state, track, index, input);
    }
    stepRace(state, track, inputs);
    events.push(...state.events);
    if (racers.every((rider) => raceIsOver(rider))) {
      break;
    }
  }
  return { events, racers, state };
};

describe("the pack", () => {
  it("a punch drains stamina and enough of them knock the rival down", () => {
    const flat = compileTrack({
      ...ridgeRoad,
      features: [],
      sections: [{ climb: 0, length: 6000, turnDegrees: 0 }],
      trafficPerKilometre: 0,
    });
    const state = field(flat, 1, 1, 0);
    const [me, rival] = state.riders;
    if (!(me && rival)) {
      throw new Error("The race needs a rival.");
    }
    rival.s = 50;
    rival.x = 1.8;
    rival.speed = 30;
    me.s = 50;
    me.x = 0.3;
    me.speed = 30;
    const idle = {
      brake: 0,
      kick: false,
      punch: false,
      steer: 0,
      throttle: 0.5,
    };
    const events: RaceEvent[] = [];
    for (let tick = 0; tick < 8 * TICK_RATE; tick += 1) {
      const punching = { ...idle, punch: tick % 20 === 0 };
      stepRace(state, flat, [punching, idle]);
      events.push(...state.events);
      me.x = 0.3;
      me.s = rival.s;
      rival.x = 1.8;
      if (rival.mode !== "riding") {
        break;
      }
    }
    const hits = events.filter((event) => event.kind === "hit");
    expect(hits.length).toBeGreaterThan(3);
    expect(rival.mode).toBe("thrown");
    expect(
      events.some((event) => event.kind === "crash" && event.cause === "combat")
    ).toBeTruthy();
  });

  it("six riders of the new cast each finish Ridge Road, wreck, or are busted by the cop on patrol and the standings are ordered", () => {
    const { events, racers, state } = raceThePack(4);
    const finishTicks = standings(state).map(
      (index) => riderAt(state, index).finishTick
    );
    const finished = finishTicks.filter((tick) => tick >= 0);
    expect({
      placed: finishTicks.length,
      riders: state.riders.length,
      roster: state.riders.map((rider) => rider.profile.name),
    }).toStrictEqual({
      placed: 6,
      riders: 7,
      roster: [
        "You",
        "Dee Santangelo",
        "Moose Kowalczyk",
        "Juno Kade",
        "Mags Dunleavy",
        "Ruth Ann Bixby",
        "Sergeant Dolores Pike",
      ],
    });
    expect(events.some((event) => event.kind === "pursuit")).toBeTruthy();
    expect(racers.every((rider) => raceIsOver(rider))).toBeTruthy();
    expect(finished.length).toBeGreaterThanOrEqual(3);
    expect(finishTicks).toStrictEqual([
      ...finished.toSorted((left, right) => left - right),
      ...finishTicks.filter((tick) => tick < 0),
    ]);
  });

  it(
    "a cop chasing the pack through traffic rides into a car that no rider shoved it into in at most one of twelve starts",
    { timeout: 60_000 },
    () => {
      const copsInTraffic: RaceEvent[] = [];
      let batonHits = 0;
      for (let seed = 1; seed <= 12; seed += 1) {
        const { events, state } = raceThePack(seed);
        const byCop = events.filter(
          (event) => riderAt(state, event.rider).profile.role === "police"
        );
        copsInTraffic.push(
          ...byCop.filter(
            (event) =>
              event.kind === "crash" &&
              event.cause === "traffic" &&
              event.by < 0
          )
        );
        batonHits += byCop.filter((event) => event.kind === "hit").length;
      }
      expect(copsInTraffic.length).toBeLessThanOrEqual(1);
      expect(batonHits).toBeGreaterThan(0);
    }
  );
});

const sideBySide = () => {
  const state = field(straight, 1, 2, 0);
  riderAt(state, 1).s = 900;
  const me = riderAt(state, 0);
  const moose = riderAt(state, 2);
  for (const rider of [me, moose]) {
    rider.s = 50;
    rider.speed = 30;
  }
  return { me, moose, state };
};

const brawl = (
  state: RaceState,
  seconds: number,
  inputsAt: (tick: number) => readonly RiderInput[]
): RaceEvent[] => {
  const me = riderAt(state, 0);
  const moose = riderAt(state, 2);
  const events: RaceEvent[] = [];
  for (let tick = 0; tick < seconds * TICK_RATE; tick += 1) {
    me.x = 0.3;
    moose.x = 1.8;
    moose.s = me.s;
    stepRace(state, straight, inputsAt(tick));
    events.push(...state.events);
  }
  return events;
};

const pressing = (key: "punch" | "kick", pressed: boolean): RiderInput => ({
  ...cruising,
  [key]: pressed,
});

describe("recovering", () => {
  it("a rider punched onto the outside grass of a bend at 80 km/h rolls off and steers back onto the road within two seconds", () => {
    const state = field(quietTrack, 1, 1, 0);
    const me = riderAt(state, 0);
    const rival = riderAt(state, 1);
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

describe("weapons", () => {
  it("a club swing drains far more stamina than a punch", () => {
    const punched = sideBySide();
    brawl(punched.state, 1, (tick) => [
      pressing("punch", tick === 0),
      cruising,
      cruising,
    ]);
    const clubbed = sideBySide();
    const events = brawl(clubbed.state, 1, (tick) => [
      cruising,
      cruising,
      pressing("punch", tick === 0),
    ]);
    const fist = MAX_STAMINA - punched.moose.stamina;
    const club = MAX_STAMINA - clubbed.me.stamina;
    expect(fist).toBeGreaterThan(0);
    expect(club).toBeGreaterThan(fist * 1.5);
    expect(events).toContainEqual({
      attack: "swing",
      kind: "hit",
      rider: 2,
      target: 0,
      weapon: "club",
    });
  });

  it("a club breaks after six hits and its owner goes back to fists", () => {
    const { moose, me, state } = sideBySide();
    expect(moose.weapon).toBe("club");
    const events = brawl(state, 14, () => {
      me.stamina = MAX_STAMINA;
      return [cruising, cruising, pressing("punch", true)];
    });
    const clubHits = events.filter(
      (event) => event.kind === "hit" && event.weapon === "club"
    );
    expect(clubHits).toHaveLength(6);
    expect(events).toContainEqual({
      kind: "weaponBroken",
      rider: 2,
      weapon: "club",
    });
    expect(moose.weapon).toBe("none");
    expect(events.at(-1)).toMatchObject({ attack: "punch", weapon: "none" });
  });

  it("a kick that lands on an armed rival takes the weapon", () => {
    const { moose, me, state } = sideBySide();
    expect(me.weapon).toBe("none");
    const events = brawl(state, 2, (tick) => [
      tick < 60 ? pressing("kick", tick === 0) : pressing("punch", tick === 60),
      cruising,
      cruising,
    ]);
    expect(events).toContainEqual({
      kind: "weaponTaken",
      rider: 0,
      target: 2,
      weapon: "club",
    });
    expect([me.weapon, moose.weapon]).toStrictEqual(["club", "none"]);
    expect(events).toContainEqual({
      attack: "swing",
      kind: "hit",
      rider: 0,
      target: 2,
      weapon: "club",
    });
    expect(me.weaponHits).toBe(5);
  });
});

const patrolFrom = (state: RaceState, copIndex: number, s: number) => {
  const cop = riderAt(state, copIndex);
  cop.parked = false;
  cop.s = s;
  cop.x = track.plan.laneWidth / 2;
  cop.speed = PATROL_SPEED;
  return cop;
};

describe("meeting the police", () => {
  it("a cop parked on the verge pulls out after the pack before the player has ridden two kilometres", () => {
    const state = createRace(defaultSetup(track, 4));
    const cop = riderAt(state, 6);
    expect({
      offRoad: Math.abs(cop.x) > track.roadHalfWidth,
      s: cop.s,
      speed: cop.speed,
    }).toStrictEqual({ offRoad: true, s: 1500, speed: 0 });
    const inputs = state.riders.map(() => ({ ...cruising }));
    const pursuits: RaceEvent[] = [];
    let fastestWhileParked = 0;
    while (player(state).s < 2000 && state.tick < 120 * TICK_RATE) {
      for (const [index, input] of inputs.entries()) {
        pilotInput(state, track, index, input);
      }
      stepRace(state, track, inputs);
      pursuits.push(
        ...state.events.filter((event) => event.kind === "pursuit")
      );
      if (pursuits.length === 0) {
        fastestWhileParked = Math.max(fastestWhileParked, cop.speed);
      }
    }
    expect(player(state).s).toBeGreaterThanOrEqual(2000);
    expect(pursuits.length).toBeGreaterThan(0);
    expect({
      fastestWhileParked,
      onRoad: Math.abs(cop.x) < track.roadHalfWidth,
    }).toStrictEqual({ fastestWhileParked: 0, onRoad: true });
  });
});

const crashNearCop = (
  copS: number,
  police: PoliceSetup = defaultPolice,
  seconds = 15
) => {
  const state = createRace({
    ...defaultSetup(straight, 1),
    police,
    rivals: [],
  });
  const me = riderAt(state, 0);
  const cop = patrolFrom(state, 1, copS);
  me.s = 200;
  me.speed = 15;
  me.stamina = 0;
  const copInput = { ...cruising };
  const flatOut = { ...cruising, throttle: 1 };
  const events: RaceEvent[] = [];
  for (let tick = 0; tick < seconds * TICK_RATE; tick += 1) {
    pilotInput(state, straight, 1, copInput);
    stepRace(state, straight, [towardTheBike(me, flatOut), copInput]);
    events.push(...state.events);
  }
  return { cop, events, me, state };
};

describe("police", () => {
  it("a cop busts a rider who is still off the bike when it arrives", () => {
    const { events, me, state } = crashNearCop(150);
    expect(events.map((event) => event.kind)).toContain("crash");
    expect(events).toContainEqual(
      expect.objectContaining({
        cop: 1,
        fine: defaultPolice.fine,
        kind: "busted",
        rider: 0,
      })
    );
    expect(events.map((event) => event.kind)).not.toContain("remount");
    expect({
      mode: me.mode,
      pulledOver: Math.abs(me.bodyX) > straight.roadHalfWidth,
    }).toStrictEqual({ mode: "busted", pulledOver: true });
    expect(standings(state)).toStrictEqual([0]);
  });

  it("the arrest is reported where the body lay and with the weapon the rider was thrown with", () => {
    const state = createRace({ ...defaultSetup(straight, 1), rivals: [] });
    const me = riderAt(state, 0);
    patrolFrom(state, 1, 150);
    me.s = 200;
    me.speed = 15;
    me.stamina = 0;
    arm(me, "chain");
    const copInput = { ...cruising };
    let body = { s: me.bodyS, x: me.bodyX };
    let arrest: RaceEvent | undefined;
    while (!arrest && state.tick < 15 * TICK_RATE) {
      body = { s: me.bodyS, x: me.bodyX };
      pilotInput(state, straight, 1, copInput);
      stepRace(state, straight, [cruising, copInput]);
      arrest = state.events.find((event) => event.kind === "busted");
    }
    if (arrest?.kind !== "busted") {
      throw new Error("The cop made no arrest.");
    }
    expect(arrest.weapon).toBe("chain");
    expect(Math.abs(arrest.s - body.s)).toBeLessThan(0.2);
    expect(Math.abs(arrest.x - body.x)).toBeLessThan(0.2);
    expect({
      arrestedOnTheRoad: Math.abs(arrest.x) < straight.roadHalfWidth,
      movedToTheVerge: Math.abs(me.bodyX) > straight.roadHalfWidth,
      weapon: me.weapon,
    }).toStrictEqual({
      arrestedOnTheRoad: true,
      movedToTheVerge: true,
      weapon: "none",
    });
  });

  it("a rider who remounts before the cop arrives is not busted, and the cop gives chase instead", () => {
    const { cop, events, me } = crashNearCop(60, defaultPolice, 9);
    expect(events.map((event) => event.kind)).toContain("remount");
    expect(events).toContainEqual({ kind: "pursuit", rider: 1, target: 0 });
    expect(events.map((event) => event.kind)).not.toContain("busted");
    expect(me.mode).toBe("riding");
    expect(me.s).toBeGreaterThan(cop.s);
  });
});

const knockedOffBeside = (speed: number) => {
  const state = createRace({ ...defaultSetup(straight, 1), rivals: [] });
  const me = riderAt(state, 0);
  const cop = patrolFrom(state, 1, 200);
  cop.speed = speed;
  me.s = 200;
  me.x = 0;
  me.speed = speed;
  me.stamina = 0;
  const copInput = { ...cruising };
  const flatOut = { ...cruising, throttle: 1 };
  let ticksToArrest = -1;
  for (let tick = 0; tick < 15 * TICK_RATE; tick += 1) {
    pilotInput(state, straight, 1, copInput);
    stepRace(state, straight, [towardTheBike(me, flatOut), copInput]);
    if (state.events.some((event) => event.kind === "busted")) {
      ticksToArrest = tick;
    }
  }
  return { mode: me.mode, ticksToArrest };
};

const patrolWithBeat = (beat: number) => {
  const state = createRace({
    ...defaultSetup(straight, 1),
    police: { ...defaultPolice, beat },
    rivals: [],
  });
  const me = riderAt(state, 0);
  const cop = riderAt(state, 1);
  const post = cop.s;
  me.s = post - 10;
  me.x = -1.8;
  const copInput = { ...cruising };
  let chased = false;
  for (let tick = 0; tick < 40 * TICK_RATE; tick += 1) {
    me.speed = 30;
    me.x = -1.8;
    me.stamina = MAX_STAMINA;
    pilotInput(state, straight, 1, copInput);
    stepRace(state, straight, [cruising, copInput]);
    chased ||= chaserDistance(state, 0) >= 0;
  }
  return {
    chased,
    chasing: chaserDistance(state, 0) >= 0,
    offTheRoad: Math.abs(cop.x) > straight.roadHalfWidth,
    past: cop.s - post,
    speed: cop.speed,
  };
};

describe("the bust window", () => {
  it("a cop beside a rider who is knocked off at walking pace arrests them, but not in the first half second", () => {
    const { mode, ticksToArrest } = knockedOffBeside(4);
    expect(mode).toBe("busted");
    expect(ticksToArrest).toBeGreaterThanOrEqual(30);
    expect(ticksToArrest).toBeLessThan(90);
  });

  it("a cop beside a rider who is knocked off at 160 km/h brakes, is passed by the flying body, and arrests it within a second and a half", () => {
    const { mode, ticksToArrest } = knockedOffBeside(45);
    expect(mode).toBe("busted");
    expect(ticksToArrest).toBeGreaterThanOrEqual(30);
    expect(ticksToArrest).toBeLessThan(1.5 * TICK_RATE);
  });

  it("a cop gives up the chase at the end of its beat and pulls off the road", () => {
    const short = patrolWithBeat(400);
    const long = patrolWithBeat(5000);
    expect(short).toMatchObject({
      chased: true,
      chasing: false,
      offTheRoad: true,
      speed: 0,
    });
    expect(short.past).toBeGreaterThan(400);
    expect(short.past).toBeLessThan(550);
    expect(long).toMatchObject({ chasing: true, offTheRoad: false });
  });
});

const parked: RiderInput = { ...cruising, brake: 1, throttle: 0 };

describe("the end of a patrol", () => {
  it("a cop that reaches the end of the track pulls off the road and the traffic behind it drives on", () => {
    const state = field(track, 7, 0, 1);
    const cop = patrolFrom(state, 1, track.length - 79);
    cop.speed = 3;
    const follower = state.cars.find((car) => car.speed > 0);
    if (!follower) {
      throw new Error("The race has no traffic going the cop's way.");
    }
    follower.s = cop.s - 40;
    const copInput = { ...cruising };
    let slowest = follower.speed;
    for (let tick = 0; tick < 12 * TICK_RATE; tick += 1) {
      pilotInput(state, track, 1, copInput);
      stepRace(state, track, [parked, copInput]);
      slowest = Math.min(slowest, follower.speed);
    }
    expect(cop.mode).toBe("riding");
    expect(cop.speed).toBe(0);
    expect(Math.abs(cop.x)).toBeGreaterThan(track.roadHalfWidth);
    expect(slowest).toBeGreaterThan(10);
    expect(follower.s).toBeGreaterThan(cop.s + 50);
  });
});

const column = (riderCount: number) => {
  const setup = defaultSetup(straight, 1);
  const state = createRace({
    ...setup,
    police: { ...setup.police, count: 0 },
    rivals: setup.rivals
      .slice(0, riderCount - 1)
      .map((rival) => ({ ...rival, bike: setup.player.bike })),
  });
  for (const rider of state.riders) {
    rider.s = 100;
    rider.x = 0;
    rider.speed = 30;
  }
  return state;
};

const pileup = (movingIndex: number) => {
  const state = column(3);
  const rear = riderAt(state, 0);
  rear.speed = 50;
  const moving = riderAt(state, movingIndex);
  moving.s = 101.8;
  moving.x = -0.3;
  const stopped = riderAt(state, 3 - movingIndex);
  stopped.s = 102.5;
  stopped.x = 0.3;
  stopped.speed = 0;
  return { moving, rear, state, stopped };
};

const ride = <Sample>(
  state: RaceState,
  seconds: number,
  sample: (events: readonly RaceEvent[]) => Sample
): Sample[] => {
  const inputs = state.riders.map(() => cruising);
  const samples: Sample[] = [];
  for (let tick = 0; tick < seconds * TICK_RATE; tick += 1) {
    stepRace(state, straight, inputs);
    samples.push(sample(state.events));
  }
  return samples;
};

const rearEndAt = (closing: number) => {
  const state = column(2);
  const rear = riderAt(state, 0);
  const ahead = riderAt(state, 1);
  rear.s = ahead.s - 2.6;
  rear.speed = 30 + closing;
  ahead.speed = 30;
  const kinds = ride(state, 0.2, (events) =>
    events.flatMap((event) =>
      event.kind === "crash" || event.kind === "riderContact"
        ? [event.kind]
        : []
    )
  ).flat();
  return { ahead, kinds, rear };
};

describe("rider contact", () => {
  it.each([
    { front: 1, rear: 0 },
    { front: 0, rear: 1 },
  ])(
    "a rider who runs into the back of another stays behind ($rear into $front)",
    ({ front, rear }) => {
      const state = column(2);
      const behind = riderAt(state, rear);
      const ahead = riderAt(state, front);
      behind.s = ahead.s - 1.5;
      behind.speed = 34;
      const gaps = ride(state, 1, () => ahead.s - behind.s);
      expect(behind.mode).toBe("riding");
      expect(Math.min(...gaps)).toBeGreaterThan(0);
    }
  );

  it.each([{ closing: 12 }, { closing: 17 }])(
    "a rider who runs into the back of a bike $closing m/s slower is not thrown: they drop to its speed and shove it on",
    ({ closing }) => {
      const { ahead, kinds, rear } = rearEndAt(closing);
      expect({
        crashed: kinds.includes("crash"),
        mode: rear.mode,
        touched: kinds.includes("riderContact"),
      }).toStrictEqual({ crashed: false, mode: "riding", touched: true });
      expect(rear.s).toBeLessThan(ahead.s);
      expect(rear.speed).toBeLessThan(30 + closing - 5);
      expect(ahead.speed).toBeGreaterThan(30 + closing * 0.25);
    }
  );

  it("a rider who runs into the back of a bike 20 m/s slower is thrown", () => {
    const { kinds, rear } = rearEndAt(20);
    expect(kinds).toContain("crash");
    expect(rear.mode).toBe("thrown");
  });

  it("a rider who runs into a stopped bike at 60 m/s takes the damage of a 60 m/s crash", () => {
    const state = column(2);
    const rear = riderAt(state, 0);
    const ahead = riderAt(state, 1);
    rear.s = ahead.s - 2.6;
    rear.speed = 60;
    ahead.speed = 0;
    const crashes = ride(state, 0.1, (events) =>
      events.flatMap((event) =>
        event.kind === "crash" && event.rider === 0 ? [event.speed] : []
      )
    ).flat();
    expect(crashes).toHaveLength(1);
    expect(crashes[0]).toBeGreaterThan(58);
    expect(FULL_CONDITION - rear.condition).toBeCloseTo(32.4, 0);
    expect(rear.bodyS).toBeLessThan(ahead.s);
  });

  it.each([
    { across: 0, back: 2.1, speed: 60 },
    { across: 0, back: 2.5, speed: 60 },
    { across: 0, back: 2.9, speed: 60 },
    { across: 0, back: 3.05, speed: 60 },
    { across: 0.5, back: 2.2, speed: 45 },
    { across: 0.5, back: 2.65, speed: 45 },
    { across: -0.7, back: 2.4, speed: 30 },
    { across: -0.7, back: 2.45, speed: 30 },
  ])(
    "a rider closing at $speed m/s from $back m behind a stopped bike, $across m across, is thrown off the back of it and not shoved past",
    ({ across, back, speed }) => {
      const state = column(2);
      const rear = riderAt(state, 0);
      const ahead = riderAt(state, 1);
      rear.s = ahead.s - back;
      rear.x = across;
      rear.speed = speed;
      ahead.speed = 0;
      const events = ride(state, 0.2, (tick) =>
        tick.flatMap((event) => {
          if (event.kind === "crash" && event.rider === 0) {
            return [event.cause];
          }
          return event.kind === "riderContact" ? ["shove"] : [];
        })
      ).flat();
      expect(events).toStrictEqual(["rider"]);
      expect(rear.x).toBeCloseTo(across, 5);
      expect(rear.bodyS).toBeLessThan(ahead.s);
      expect(ahead.speed).toBeGreaterThan(0);
    }
  );

  it("a rider who drifts across into a slower bike alongside is shoved and keeps riding", () => {
    const state = column(2);
    const passing = riderAt(state, 0);
    const slower = riderAt(state, 1);
    passing.s = slower.s - 1;
    passing.x = 0.9;
    passing.speed = 42;
    passing.lateralSpeed = -4;
    const shoves = ride(
      state,
      0.2,
      (tick) => tick.filter((event) => event.kind === "riderContact").length
    );
    expect(Math.max(...shoves)).toBe(1);
    expect([passing.mode, slower.mode]).toStrictEqual(["riding", "riding"]);
    expect(passing.x - slower.x).toBeGreaterThan(0.8);
  });

  it("a rider squeezed from both sides for a second loses between a sixth and a third of their speed, not all of it", () => {
    const state = column(3);
    const [me, left, right] = [0, 1, 2].map((index) => riderAt(state, index));
    if (!(me && left && right)) {
      throw new Error("The column has fewer than three riders.");
    }
    left.x = -0.9;
    right.x = 0.9;
    for (const rider of state.riders) {
      rider.speed = 40;
    }
    const flatOut = { ...cruising, throttle: 1 };
    let contacts = 0;
    for (let tick = 0; tick < TICK_RATE; tick += 1) {
      me.x = 0;
      left.x = -0.7;
      right.x = 0.7;
      stepRace(state, straight, [
        flatOut,
        { ...flatOut, steer: 1 },
        { ...flatOut, steer: -1 },
      ]);
      contacts += state.events.filter(
        (event) => event.kind === "riderContact"
      ).length;
    }
    expect(contacts).toBeGreaterThan(20);
    expect(me.mode).toBe("riding");
    expect(me.speed).toBeGreaterThan(27);
    expect(me.speed).toBeLessThan(35);
  });

  it("two bikes that lean on each other from a standstill both pull away", () => {
    const state = column(2);
    const behind = riderAt(state, 0);
    const ahead = riderAt(state, 1);
    behind.s = ahead.s - 1.975;
    behind.x = 0.43;
    ahead.x = -0.43;
    behind.speed = 0;
    ahead.speed = 0;
    const flatOut = { ...cruising, throttle: 1 };
    for (let tick = 0; tick < 5 * TICK_RATE; tick += 1) {
      stepRace(state, straight, [
        { ...flatOut, steer: -0.5 },
        { ...flatOut, steer: 0.5 },
      ]);
    }
    expect(behind.speed).toBeGreaterThan(8);
    expect(ahead.speed).toBeGreaterThan(8);
  });

  it("a pileup throws each rider at most once a tick", () => {
    const { rear, state, stopped } = pileup(1);
    const crashes = ride(state, 0.5, (events) =>
      state.riders.map(
        (_, index) =>
          events.filter(
            (event) => event.kind === "crash" && event.rider === index
          ).length
      )
    ).flat();
    expect(Math.max(...crashes)).toBe(1);
    expect(rear.crashes).toBe(1);
    expect(rear.bodyS).toBeGreaterThan(stopped.s);
  });

  it("a pileup launches the rear rider and leaves the two in front the same whichever of them is listed first", () => {
    const [first, swapped] = [1, 2].map((movingIndex) => {
      const { moving, rear, state, stopped } = pileup(movingIndex);
      const launches = ride(state, 0.5, (events) =>
        events.flatMap((event) =>
          event.kind === "crash" && event.rider === 0 ? [event.speed] : []
        )
      ).flat();
      return {
        launches,
        moving: [moving.mode, moving.s, moving.x, moving.speed],
        rear: [rear.bodyS, rear.bodyX, rear.s, rear.x],
        stopped: [stopped.mode, stopped.s, stopped.x, stopped.speed],
      };
    });
    expect(first?.launches).toHaveLength(1);
    expect(first?.launches[0]).toBeGreaterThan(20);
    expect(swapped).toStrictEqual(first);
  });
});

const strikeTiming = (key: "punch" | "kick", pressTicks: readonly number[]) => {
  const { me, moose, state } = sideBySide();
  disarm(moose);
  const landed: number[] = [];
  const started: number[] = [];
  let neutralTicks = 0;
  brawl(state, 1.5, (tick) => {
    moose.stamina = MAX_STAMINA;
    for (const event of state.events) {
      if (event.kind === "hit" && event.rider === 0) {
        landed.push(tick - 1);
      }
      if (event.kind === "attack" && event.rider === 0) {
        started.push(tick - 1);
      }
    }
    if (tick > 0 && tick <= 34 && me.attack === "none") {
      neutralTicks += 1;
    }
    return [pressing(key, pressTicks.includes(tick)), cruising, cruising];
  });
  return { landed, neutralTicks, started };
};

describe("strike timing", () => {
  it("a punch is fully out 4 ticks after the press and the swing is over at 18; a kick is out at 4 and over at 15", () => {
    const { me, moose, state } = sideBySide();
    disarm(moose);
    const ends: Record<string, number> = {};
    const lands: Record<string, number> = {};
    for (const key of ["punch", "kick"] as const) {
      me.attackCooldown = 0;
      let pressed = -1;
      brawl(state, 1, (tick) => {
        for (const event of state.events) {
          if (event.kind === "attack" && event.rider === 0) {
            pressed = state.tick;
          }
          if (event.kind === "hit" && event.rider === 0) {
            lands[key] = state.tick - pressed;
          }
        }
        if (pressed >= 0 && me.attack === "none" && ends[key] === undefined) {
          ends[key] = state.tick - pressed;
        }
        return [pressing(key, tick === 0), cruising, cruising];
      });
    }
    expect({ ends, lands }).toStrictEqual({
      ends: { kick: 15, punch: 18 },
      lands: { kick: 4, punch: 4 },
    });
  });

  it("a second punch pressed 16 ticks after the first starts at once, lands 4 ticks later, and the arm never comes back to neutral between them", () => {
    const { landed, neutralTicks, started } = strikeTiming("punch", [0, 16]);
    expect(started).toStrictEqual([0, 16]);
    expect(landed).toStrictEqual([4, 20]);
    expect(neutralTicks).toBe(0);
  });

  it("a second punch pressed while the first is still winding up is ignored", () => {
    const { landed, started } = strikeTiming("punch", [0, 3]);
    expect(started).toStrictEqual([0]);
    expect(landed).toStrictEqual([4]);
  });

  it("mashing the punch key lands a hit no more often than every 16 ticks", () => {
    const { landed } = strikeTiming(
      "punch",
      Array.from({ length: 90 }, (_, tick) => tick)
    );
    const gaps = landed
      .slice(1)
      .map((tick, index) => tick - (landed[index] ?? 0));
    expect(landed.length).toBeGreaterThanOrEqual(4);
    expect(Math.min(...gaps)).toBe(16);
  });

  it("a kick cannot be chained into a punch's follow-through", () => {
    const { me, moose, state } = sideBySide();
    disarm(moose);
    const started: string[] = [];
    brawl(state, 1, (tick) => {
      for (const event of state.events) {
        if (event.kind === "attack" && event.rider === 0) {
          started.push(`${event.attack}@${state.tick - 1}`);
        }
      }
      return [
        { ...cruising, kick: tick === 16, punch: tick === 0 },
        cruising,
        cruising,
      ];
    });
    expect(started).toStrictEqual(["punch@0"]);
    expect(me.attack).toBe("none");
  });
});

const knockedOffAndRunning = () => {
  const state = field(straight, 1, 1, 0);
  const me = riderAt(state, 0);
  const rival = riderAt(state, 1);
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
    stepRace(state, straight, [neutralInput, cruising]);
  }
  expect(me.mode).toBe("running");
  return { me, rival, state };
};

const untilOnFeetAgain = (
  state: RaceState,
  me: RiderState,
  inputs: readonly RiderInput[]
) => {
  const events: RaceEvent[] = [];
  let ticksDown = -1;
  for (let tick = 0; tick < 10 * TICK_RATE; tick += 1) {
    stepRace(state, straight, inputs);
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
    const { me, state } = knockedOffAndRunning();
    state.cars.push({
      cruiseSpeed: 20,
      halfLength: 2.2,
      halfWidth: 0.92,
      height: 1.45,
      paint: 2,
      s: me.bodyS - 2.2,
      speed: 20,
      x: me.bodyX,
    });
    const { events, ticksDown } = untilOnFeetAgain(state, me, [
      neutralInput,
      cruising,
    ]);
    expect(events).toContainEqual(
      expect.objectContaining({ by: -1, kind: "knockedDown", rider: 0 })
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
    const { events } = untilOnFeetAgain(state, me, [neutralInput, cruising]);
    expect(events).toContainEqual(
      expect.objectContaining({ by: 1, kind: "knockedDown", rider: 0 })
    );
    expect(events).toContainEqual({ kind: "bump", rider: 1 });
    expect(rival.mode).toBe("riding");
    expect(rival.speed).toBeGreaterThan(18);
    expect(me.lastHitBy).toBe(1);
  });
});

const awayFromTheBike = (rider: RiderState): RiderInput => {
  const back = towardTheBike(rider, neutralInput);
  return {
    ...back,
    brake: back.throttle,
    steer: -back.steer,
    throttle: back.brake,
  };
};

const thrownWhileHolding = (held: RiderInput) => {
  const state = field(straight, 1, 1, 0);
  const me = riderAt(state, 0);
  const rival = riderAt(state, 1);
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
    stepRace(state, straight, [held, cruising]);
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
    stepRace(state, straight, [inputFor(me), cruising]);
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

describe("on foot", () => {
  it("a rider on their feet who holds the controls toward the bike runs to it and remounts, and the bike has not moved", () => {
    const { me, state } = knockedOffAndRunning();
    const bike = { s: me.s, x: me.x };
    const run = onFoot(state, me, 6, (rider) =>
      towardTheBike(rider, neutralInput)
    );
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

  it("a rider who touches nothing stands where they got up for four seconds, then walks back to the bike by themselves", () => {
    const { me, state } = knockedOffAndRunning();
    const waiting = onFoot(state, me, 3.5, () => neutralInput);
    expect(waiting.moved).toBe(0);
    expect(waiting.remounted).toBeFalsy();
    expect(me.mode).toBe("running");
    const walking = onFoot(state, me, 6, () => neutralInput);
    expect(walking.remounted).toBeTruthy();
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

  it("a rider on foot cannot leave the verge or walk through the finish", () => {
    const { me, state } = knockedOffAndRunning();
    const sideways = { ...neutralInput, steer: -1 };
    onFoot(state, me, 4, () => sideways);
    expect(me.bodyX).toBe(-straight.vergeHalfWidth);
    me.bodyS = straight.length - 5;
    const forward = { ...neutralInput, throttle: 1 };
    onFoot(state, me, 3, () => forward);
    expect(me.bodyS).toBe(straight.length);
    expect(me.finishTick).toBe(-1);
  });

  it("a rival knocked off runs back to their bike and remounts on their own", () => {
    const state = field(straight, 1, 1, 0);
    const me = riderAt(state, 0);
    const rival = riderAt(state, 1);
    me.s = 900;
    rival.s = 100;
    rival.speed = 20;
    rival.stamina = 0;
    const rivalInput = { ...cruising };
    const events: RaceEvent[] = [];
    const modes: string[] = [];
    for (let tick = 0; tick < 10 * TICK_RATE; tick += 1) {
      pilotInput(state, straight, 1, rivalInput);
      stepRace(state, straight, [neutralInput, rivalInput]);
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
    expect(events).toContainEqual({ kind: "remount", rider: 1 });
    expect(rival.speed).toBeGreaterThan(5);
  });

  it("a cop reaching a rider who is standing on foot arrests them", () => {
    const state = createRace({ ...defaultSetup(straight, 1), rivals: [] });
    const me = riderAt(state, 0);
    patrolFrom(state, 1, 100);
    me.s = 200;
    me.speed = 10;
    me.stamina = 0;
    const copInput = { ...cruising };
    const events: RaceEvent[] = [];
    for (
      let tick = 0;
      tick < 15 * TICK_RATE && me.mode !== "busted";
      tick += 1
    ) {
      pilotInput(state, straight, 1, copInput);
      stepRace(state, straight, [neutralInput, copInput]);
      events.push(...state.events);
    }
    expect(events.map((event) => event.kind)).not.toContain("remount");
    expect(me.mode).toBe("busted");
  });
});

describe("simultaneous strikes", () => {
  it("two riders who punch each other on the same tick both land", () => {
    const { moose, me, state } = sideBySide();
    moose.weapon = "none";
    moose.weaponHits = 0;
    const events = brawl(state, 1, (tick) => [
      pressing("punch", tick === 0),
      cruising,
      pressing("punch", tick === 0),
    ]);
    const hits = events.filter((event) => event.kind === "hit");
    expect(hits).toContainEqual({
      attack: "punch",
      kind: "hit",
      rider: 0,
      target: 2,
      weapon: "none",
    });
    expect(hits).toContainEqual({
      attack: "punch",
      kind: "hit",
      rider: 2,
      target: 0,
      weapon: "none",
    });
    expect(me.stamina).toBe(moose.stamina);
    expect(me.stamina).toBeLessThan(MAX_STAMINA);
  });

  it("two riders who punch each other on the same tick are stunned for the same time", () => {
    const { moose, me, state } = sideBySide();
    disarm(moose);
    const stuns: number[][] = [];
    brawl(state, 0.5, (tick) => {
      stuns.push([me.hitStun, moose.hitStun]);
      return [
        pressing("punch", tick === 0),
        cruising,
        pressing("punch", tick === 0),
      ];
    });
    expect(Math.max(...stuns.flat())).toBe(10);
    expect(stuns.filter(([mine, theirs]) => mine !== theirs)).toStrictEqual([]);
  });
});

const duel = (
  unarmedIndex: number,
  inputsAt: (tick: number) => { unarmed: RiderInput; holder: RiderInput }
) => {
  const state = field(straight, 1, 1, 0);
  const unarmed = riderAt(state, unarmedIndex);
  const holder = riderAt(state, 1 - unarmedIndex);
  disarm(unarmed);
  arm(holder, "chain");
  for (const rider of state.riders) {
    rider.s = 50;
    rider.speed = 30;
  }
  for (let tick = 0; tick < TICK_RATE; tick += 1) {
    unarmed.x = 0.3;
    holder.x = 1.8;
    holder.s = unarmed.s;
    const inputs = inputsAt(tick);
    stepRace(
      state,
      straight,
      unarmedIndex === 0
        ? [inputs.unarmed, inputs.holder]
        : [inputs.holder, inputs.unarmed]
    );
  }
  return {
    holder: [holder.weapon, holder.weaponHits],
    unarmed: [unarmed.weapon, unarmed.weaponHits],
  };
};

describe("simultaneous weapon grabs", () => {
  it.each([{ unarmedIndex: 0 }, { unarmedIndex: 1 }])(
    "an unarmed rider and a chain holder who kick each other on the same tick leave the chain with the unarmed one (unarmed is rider $unarmedIndex)",
    ({ unarmedIndex }) => {
      const after = duel(unarmedIndex, (tick) => ({
        holder: pressing("kick", tick === 0),
        unarmed: pressing("kick", tick === 0),
      }));
      expect(after).toStrictEqual({
        holder: ["none", 0],
        unarmed: ["chain", 8],
      });
    }
  );

  it.each([{ unarmedIndex: 0 }, { unarmedIndex: 1 }])(
    "a chain that lands on the tick it is kicked away has one hit fewer (unarmed is rider $unarmedIndex)",
    ({ unarmedIndex }) => {
      const after = duel(unarmedIndex, (tick) => ({
        holder: pressing("punch", tick === 0),
        unarmed: pressing("kick", tick === 3),
      }));
      expect(after).toStrictEqual({
        holder: ["none", 0],
        unarmed: ["chain", 7],
      });
    }
  );
});

describe("armed rivals", () => {
  it("a chain holder at full aggression swings at a rider 2.8 m across within five seconds", () => {
    const state = field(straight, 1, 1, 0);
    const dee = riderAt(state, 1);
    const rival = { ...dee, profile: { ...dee.profile, aggression: 1 } };
    state.riders[1] = rival;
    state.tick = 10 * TICK_RATE;
    const me = riderAt(state, 0);
    const rivalInput = { ...cruising };
    const events: RaceEvent[] = [];
    for (let tick = 0; tick < 5 * TICK_RATE; tick += 1) {
      for (const rider of state.riders) {
        rider.s = 50;
        rider.speed = 30;
      }
      me.x = -1;
      rival.x = 1.8;
      pilotInput(state, straight, 1, rivalInput);
      stepRace(state, straight, [cruising, rivalInput]);
      events.push(...state.events);
    }
    expect(rival.weapon).toBe("chain");
    expect(events).toContainEqual({
      attack: "swing",
      kind: "hit",
      rider: 1,
      target: 0,
      weapon: "chain",
    });
  });
});

const pilotPack = (states: readonly RaceState[], seconds: number) => {
  const inputs = states.map((state) =>
    state.riders.map(() => ({ ...cruising }))
  );
  for (let tick = 0; tick < seconds * TICK_RATE; tick += 1) {
    for (const [raceIndex, state] of states.entries()) {
      const each = inputs[raceIndex] ?? [];
      for (const [index, input] of each.entries()) {
        pilotInput(state, track, index, input);
      }
      stepRace(state, track, each);
    }
  }
};

describe("replays", () => {
  it("a six-rider pack replays the same from the same seed, alone or beside another race", () => {
    const solo = createRace(defaultSetup(track, 5));
    pilotPack([solo], 40);
    const again = createRace(defaultSetup(track, 5));
    pilotPack([again], 40);
    const beside = createRace(defaultSetup(track, 5));
    const other = createRace(defaultSetup(track, 9));
    pilotPack([beside, other], 40);
    expect(JSON.stringify(again)).toBe(JSON.stringify(solo));
    expect(JSON.stringify(beside)).toBe(JSON.stringify(solo));
    expect(JSON.stringify(other)).not.toBe(JSON.stringify(solo));
  });
});

const SWITCHBACK_FROM = 1670;
const SWITCHBACK_TO = 1840;
const TURN_IN_BEFORE = 50;

const pushedWideInSwitchback = (bike: BikeSpec, kmh?: number): boolean => {
  const state = alone(quietTrack, bike);
  const rider = player(state);
  rider.s = 900;
  rider.speed = (kmh ?? 180) / 3.6;
  let widest = Number.NEGATIVE_INFINITY;
  while (rider.s < SWITCHBACK_TO) {
    rider.x = 0;
    rider.speed = kmh === undefined ? rider.speed : kmh / 3.6;
    const inBend = rider.s > SWITCHBACK_FROM;
    const turningIn = rider.s > SWITCHBACK_FROM - TURN_IN_BEFORE;
    const inside = Math.sign(curvatureAt(quietTrack, SWITCHBACK_FROM + 60));
    stepRace(state, quietTrack, [
      towardTheBike(rider, {
        ...cruising,
        steer: turningIn ? inside : 0,
        throttle: 1,
      }),
    ]);
    if (inBend) {
      widest = Math.max(widest, -rider.x * inside);
    }
  }
  return widest > 0;
};

const steerShare = (bike: BikeSpec): number => {
  const state = alone(straight, bike);
  const rider = player(state);
  rider.speed = 40;
  hold(state, straight, { ...cruising, steer: 1, throttle: 0.6 }, 0.05);
  return (
    rider.lateralSpeed / (bike.lateralSpeed + bike.lateralSpeedPerSpeed * 40)
  );
};

const topSpeedKmh = (bike: BikeSpec): number => {
  const state = alone(straight, bike);
  hold(state, straight, { ...cruising, throttle: 1 }, 60);
  return player(state).speed * 3.6;
};

describe("the bike catalogue", () => {
  it("the Wren holds the Switchback at 158 km/h where the Sesta lets go at 138; flat out the Wren scrubs down and holds it where the Sesta is pushed wide", () => {
    const wren = bikes["halden-wren-400"];
    const sesta = bikes["ostra-sesta-600"];
    expect({
      sesta: pushedWideInSwitchback(sesta),
      wren: pushedWideInSwitchback(wren),
    }).toStrictEqual({ sesta: true, wren: false });
    expect({
      sestaAbove: pushedWideInSwitchback(sesta, 138 * 1.05),
      sestaBelow: pushedWideInSwitchback(sesta, 138 * 0.95),
      wrenAbove: pushedWideInSwitchback(wren, 158 * 1.05),
      wrenBelow: pushedWideInSwitchback(wren, 158 * 0.95),
    }).toStrictEqual({
      sestaAbove: true,
      sestaBelow: false,
      wrenAbove: true,
      wrenBelow: false,
    });
  });

  it.each([
    { bike: bikes["gutter-pup-250"], kmh: 141 },
    { bike: bikes["halden-kite-500"], kmh: 149 },
    { bike: bikes["ostra-sette-750"], kmh: 134 },
    { bike: bikes["brack-stoker-800"], kmh: 128 },
    { bike: bikes["halden-meridian-900"], kmh: 134 },
    { bike: bikes["brack-anvil-1100"], kmh: 121 },
    { bike: bikes["ostra-nera-1000"], kmh: 128 },
  ])(
    "the $bike.name holds the Switchback up to about $kmh km/h",
    ({ bike, kmh }) => {
      expect({
        above: pushedWideInSwitchback(bike, kmh * 1.05),
        below: pushedWideInSwitchback(bike, kmh * 0.95),
      }).toStrictEqual({ above: true, below: false });
    }
  );

  it("the Gutter Pup answers the bars more slowly than any other bike, and the Wren fastest", () => {
    const settled = Object.values(bikes).map((bike) => ({
      id: bike.id,
      share: steerShare(bike),
    }));
    const slowest = settled.toSorted((left, right) => left.share - right.share);
    expect(slowest.at(0)?.id).toBe("gutter-pup-250");
    expect(slowest.at(-1)?.id).toBe("halden-wren-400");
  });

  it("every Heavyweight is faster flat out than the Sesta, and the Featherweights are slower", () => {
    const sesta = topSpeedKmh(bikes["ostra-sesta-600"]);
    expect(topSpeedKmh(bikes["halden-meridian-900"])).toBeGreaterThan(sesta);
    expect(topSpeedKmh(bikes["brack-anvil-1100"])).toBeGreaterThan(sesta);
    expect(topSpeedKmh(bikes["ostra-nera-1000"])).toBeGreaterThan(sesta);
    expect(topSpeedKmh(bikes["halden-kite-500"])).toBeLessThan(sesta);
    expect(topSpeedKmh(bikes["gutter-pup-250"])).toBeLessThan(160);
  });
});

const quietSlagRow = compileTrack({ ...slagRow, trafficPerKilometre: 0 });
const quietHollowPine = compileTrack({
  ...hollowPineRoad,
  trafficPerKilometre: 0,
});
const HERMITS_BEND_FROM = 6060;
const HERMITS_BEND_TO = 6240;
const DRY_DOCK_CORNER_FROM = 5120;
const DRY_DOCK_CORNER_TO = 5280;
const SAWMILL_HOOK_FROM = 3080;
const SAWMILL_HOOK_TO = 3240;

interface Cornering {
  readonly entered: number;
  readonly slowest: number;
  readonly left: number;
  readonly widest: number;
  readonly crashed: boolean;
  readonly offRoad: boolean;
}

const throttleHeldThrough = (
  course: Track,
  bike: BikeSpec,
  from: number,
  to: number,
  kmh: number
): Cornering => {
  const state = alone(course, bike);
  const rider = player(state);
  rider.s = from - TURN_IN_BEFORE;
  rider.x = 0;
  rider.speed = kmh / KMH;
  rider.gear = bike.gears.length;
  const inside = Math.sign(curvatureAt(course, from + 60));
  const input = { ...cruising, throttle: 1 };
  let slowest = rider.speed;
  let widest = 0;
  let offRoad = false;
  let crashed = false;
  while (rider.s < to && rider.mode === "riding") {
    pilotInput(state, course, 0, input);
    input.throttle = 1;
    input.brake = 0;
    stepRace(state, course, [input]);
    slowest = Math.min(slowest, rider.speed);
    widest = Math.max(widest, -rider.x * inside);
    offRoad ||= rider.offRoad;
    crashed ||= state.events.some((event) => event.kind === "crash");
  }
  return {
    crashed,
    entered: kmh,
    left: rider.speed * KMH,
    offRoad,
    slowest: slowest * KMH,
    widest,
  };
};

const lockedFor = (bike: BikeSpec, steer: number, seconds: number) => {
  const state = alone(straight, bike);
  const rider = player(state);
  rider.speed = 45;
  rider.gear = bike.gears.length;
  let moved = 0;
  for (let tick = 0; tick < seconds * TICK_RATE; tick += 1) {
    stepRace(state, straight, [{ ...cruising, steer, throttle: 0 }]);
    moved += rider.x;
    rider.x = 0;
  }
  return { moved, speed: rider.speed };
};

describe("cornering with the throttle held", () => {
  it("a Wren that holds the throttle into Hermit's Bend at 190 km/h scrubs down into the 140s, stays on the road, and leaves slower than it arrived", () => {
    const run = throttleHeldThrough(
      quietTrack,
      bikes["halden-wren-400"],
      HERMITS_BEND_FROM,
      HERMITS_BEND_TO,
      190
    );
    expect(run.crashed).toBeFalsy();
    expect(run.offRoad).toBeFalsy();
    expect(run.slowest).toBeGreaterThan(130);
    expect(run.slowest).toBeLessThan(165);
    expect(run.left).toBeLessThan(run.entered - 20);
  });

  it("the same Wren holding the throttle into Dry Dock Corner at 190 km/h runs out of road, and a lift with no brake gets it round", () => {
    const held = throttleHeldThrough(
      quietSlagRow,
      bikes["halden-wren-400"],
      DRY_DOCK_CORNER_FROM,
      DRY_DOCK_CORNER_TO,
      190
    );
    expect(held.offRoad || held.crashed).toBeTruthy();
    const state = alone(quietSlagRow, bikes["halden-wren-400"]);
    const rider = player(state);
    rider.s = DRY_DOCK_CORNER_FROM - TURN_IN_BEFORE;
    rider.x = 0;
    rider.speed = 190 / KMH;
    rider.gear = 6;
    const input = { ...cruising, throttle: 0 };
    while (rider.s < DRY_DOCK_CORNER_TO && rider.mode === "riding") {
      pilotInput(state, quietSlagRow, 0, input);
      input.throttle = rider.speed * KMH > 110 ? 0 : 1;
      input.brake = 0;
      stepRace(state, quietSlagRow, [input]);
      expect(rider.offRoad).toBeFalsy();
    }
    expect(rider.mode).toBe("riding");
  });

  it("the Sawmill Hook at 190 km/h on a Wren is a brake bend: the throttle held runs out of road", () => {
    const held = throttleHeldThrough(
      quietHollowPine,
      bikes["halden-wren-400"],
      SAWMILL_HOOK_FROM,
      SAWMILL_HOOK_TO,
      190
    );
    expect(held.offRoad || held.crashed).toBeTruthy();
  });

  it("a heavyweight at full lock scrubs less speed and moves less sideways than a featherweight", () => {
    const scrubOf = (bike: BikeSpec) =>
      lockedFor(bike, 0, 2).speed - lockedFor(bike, 1, 2).speed;
    const wren = bikes["halden-wren-400"];
    const anvil = bikes["brack-anvil-1100"];
    expect(scrubOf(wren)).toBeGreaterThan(scrubOf(anvil) * 1.2);
    expect(scrubOf(wren)).toBeGreaterThan(8);
    expect(lockedFor(anvil, 1, 1).moved).toBeLessThan(
      lockedFor(wren, 1, 1).moved
    );
  });
});

const rivalsOf = (state: RaceState): number[] =>
  state.riders
    .slice(1)
    .filter((rider) => rider.profile.role === "racer")
    .map((rider) => rider.s);

const everyRival = Object.values(rivals).map((rival) => rivalAt(rival, 3));

const setupWith = (entrants: readonly RivalSetup[]): RaceSetup => ({
  ...defaultSetup(straight, 1),
  rivals: entrants,
});

describe("race setups", () => {
  it("a setup that lists a rival twice is rejected", () => {
    const [dee, moose] = everyRival;
    if (!(dee && moose)) {
      throw new Error("The cast has fewer than two rivals.");
    }
    const setup = setupWith([dee, moose, dee]);
    expect(validateSetup(setup)).toStrictEqual([
      { kind: "duplicateRival", name: dee.name },
    ]);
    expect(() => createRace(setup)).toThrow(
      `${dee.name} is on the grid more than once.`
    );
  });

  it("a setup with fifteen rivals is rejected and fourteen fill the grid", () => {
    const fifteen = setupWith(everyRival.slice(0, 15));
    const fourteen = setupWith(everyRival.slice(0, 14));
    expect(validateSetup(fifteen)).toStrictEqual([
      { count: 15, kind: "tooManyRivals" },
    ]);
    expect(() => createRace(fifteen)).toThrow("at most 14 rivals");
    expect(validateSetup(fourteen)).toStrictEqual([]);
    expect(
      createRace(fourteen).riders.filter(
        (rider) => rider.profile.role === "racer"
      )
    ).toHaveLength(15);
  });

  it("every problem with a setup is reported at once", () => {
    const [dee] = everyRival;
    if (!dee) {
      throw new Error("The cast has no rivals.");
    }
    const setup = setupWith([...everyRival.slice(0, 15), dee]);
    expect(validateSetup(setup).map((problem) => problem.kind)).toStrictEqual([
      "tooManyRivals",
      "duplicateRival",
    ]);
    expect(() => createRace(setup)).toThrow(
      `A race takes at most 14 rivals, and this one has 16. ${dee.name} is on the grid more than once.`
    );
  });
});

const pacedPair = (course: Track, pacing: PacingRules): RaceState => {
  const setup = defaultSetup(course, 1);
  return createRace({
    ...setup,
    pacing,
    police: { ...setup.police, count: 0 },
    rivals: setup.rivals.slice(0, 1),
  });
};

const riderInputAt = (inputs: RiderInput[], index: number): RiderInput => {
  const input = inputs[index];
  if (!input) {
    throw new Error(`The race has no input ${index}.`);
  }
  return input;
};

const rideTheRival = (
  state: RaceState,
  course: Track,
  seconds: number
): number => {
  const inputs = state.riders.map(() => ({ ...neutralInput }));
  let fastest = 0;
  for (let tick = 0; tick < seconds * TICK_RATE; tick += 1) {
    pilotInput(state, course, 1, riderInputAt(inputs, 1));
    stepRace(state, course, inputs);
    fastest = Math.max(fastest, riderAt(state, 1).speed);
  }
  return fastest;
};

describe("pacing by the gap to the player", () => {
  it("a rival well clear of the player rolls off to the level's share of its top speed, and rides flat out once the player is out", () => {
    const eased: PacingRules = { catchUp: 0, leadEase: 0.2 };
    const free: PacingRules = { catchUp: 0, leadEase: 0 };
    const [paced, unpaced, playerOut] = [eased, free, eased].map((pacing) => {
      const state = pacedPair(straight, pacing);
      riderAt(state, 1).s = 400;
      return state;
    });
    if (!(paced && unpaced && playerOut)) {
      throw new Error("The pacing races were not made.");
    }
    player(playerOut).mode = "busted";
    const top = topSpeedOf(riderAt(paced, 1).bike);
    expect({
      busted: rideTheRival(playerOut, straight, 40) / top,
      free: rideTheRival(unpaced, straight, 40) / top,
      paced: rideTheRival(paced, straight, 40) / top,
    }).toStrictEqual({
      busted: expect.closeTo(1, 1),
      free: expect.closeTo(1, 1),
      paced: expect.closeTo(0.82, 1),
    });
  });

  it("a rival dropped behind the player takes the bends harder but never beats its bike's top speed", () => {
    const helped: PacingRules = { catchUp: 0.1, leadEase: 0 };
    const unhelped: PacingRules = { catchUp: 0, leadEase: 0 };
    const [onBends, onBendsAlone, onStraight] = [
      pacedPair(quietTrack, helped),
      pacedPair(quietTrack, unhelped),
      pacedPair(straight, helped),
    ];
    if (!(onBends && onBendsAlone && onStraight)) {
      throw new Error("The pacing races were not made.");
    }
    for (const state of [onBends, onBendsAlone, onStraight]) {
      player(state).s = 2000;
    }
    rideTheRival(onBends, quietTrack, 60);
    rideTheRival(onBendsAlone, quietTrack, 60);
    const fastest = rideTheRival(onStraight, straight, 40);
    expect(riderAt(onBends, 1).s).toBeGreaterThan(
      riderAt(onBendsAlone, 1).s + 20
    );
    expect(fastest).toBeLessThanOrEqual(
      topSpeedOf(riderAt(onStraight, 1).bike, true) * 1.01
    );
  });
});

const gearTrace = (bike: BikeSpec, seconds: number) => {
  const state = alone(straight, bike);
  const rider = player(state);
  const trace: { gear: number; revs: number; speed: number }[] = [];
  for (let tick = 0; tick < seconds * TICK_RATE; tick += 1) {
    stepRace(state, straight, [{ ...cruising, throttle: 1 }]);
    trace.push({ gear: rider.gear, revs: rider.revs, speed: rider.speed });
  }
  return trace;
};

const pullAt = (
  trace: readonly { gear: number; revs: number; speed: number }[],
  gear: number,
  revs: number
): number => {
  const index = trace.findIndex(
    (step) => step.gear === gear && step.revs >= revs
  );
  const before = trace[index - 1];
  const after = trace[index + 1];
  if (!(before && after)) {
    throw new Error(
      `The bike never reached ${revs} of the redline in gear ${gear}.`
    );
  }
  return ((after.speed - before.speed) * TICK_RATE) / 2;
};

describe("gears and the tuck", () => {
  it("the starter bike climbs through all six gears on a straight, and every upshift is a short lull before it pulls again", () => {
    const trace = gearTrace(bikes["halden-wren-400"], 25);
    const shifts = trace
      .map((step, tick) => ({ step, tick }))
      .filter(
        ({ step, tick }) => tick > 0 && step.gear !== trace[tick - 1]?.gear
      );
    expect(shifts.map(({ step }) => step.gear)).toStrictEqual([2, 3, 4, 5, 6]);
    for (const { tick } of shifts) {
      const atShift = trace[tick];
      const beforeShift = trace[tick - 1];
      const afterCut = trace[tick + 8];
      const pullingAgain = trace[tick + 30];
      if (!(atShift && beforeShift && afterCut && pullingAgain)) {
        throw new Error("The trace is too short.");
      }
      expect(atShift.revs).toBeLessThan(beforeShift.revs - 0.08);
      expect(afterCut.speed).toBeLessThan(atShift.speed + 0.05);
      expect(pullingAgain.speed).toBeGreaterThan(afterCut.speed + 0.5);
    }
    expect((trace.at(-1)?.speed ?? 0) * KMH).toBeGreaterThan(185);
  });

  it("in a gear the bike pulls hardest in the middle of the rev range and tails off toward the redline", () => {
    const trace = gearTrace(bikes["halden-wren-400"], 25);
    const inTheBand = pullAt(trace, 2, 0.8);
    const atTheRedline = pullAt(trace, 2, 0.95);
    expect(inTheBand).toBeGreaterThan(atTheRedline * 1.1);
    expect(pullAt(trace, 3, 0.8)).toBeGreaterThan(pullAt(trace, 3, 0.95) * 1.1);
  });

  it("a rider who holds the throttle and sits still tucks in at speed and tops out about four per cent faster than one who keeps swinging", () => {
    const bike = bikes["halden-wren-400"];
    const still = alone(straight, bike);
    const swinging = alone(straight, bike);
    hold(still, straight, { ...cruising, throttle: 1 }, 60);
    hold(swinging, straight, { ...cruising, punch: true, throttle: 1 }, 60);
    expect(player(still).tuck).toBe(1);
    expect(player(swinging).tuck).toBe(0);
    expect(player(still).speed).toBeCloseTo(topSpeedOf(bike, true), 0);
    expect(player(swinging).speed).toBeCloseTo(topSpeedOf(bike), 0);
    const gain = player(still).speed / player(swinging).speed;
    expect(gain > 1.03 && gain < 1.06).toBeTruthy();
  });

  it("the rider sits up for the first seconds off the line and tucks in only after a second and a half above 120 km/h, easing in over a second", () => {
    const state = alone(straight, bikes["halden-wren-400"]);
    const rider = player(state);
    const fullThrottle = { ...cruising, throttle: 1 };
    hold(state, straight, fullThrottle, 3);
    const atThreeSeconds = { speed: rider.speed * KMH, tuck: rider.tuck };
    let tuckedEarly = false;
    while (rider.speed * KMH <= 120) {
      stepRace(state, straight, [fullThrottle]);
      tuckedEarly ||= rider.tuck > 0;
    }
    hold(state, straight, fullThrottle, 1.4);
    const settling = rider.tuck;
    hold(state, straight, fullThrottle, 0.2);
    const easingIn = rider.tuck;
    hold(state, straight, fullThrottle, 1);
    expect(atThreeSeconds.speed).toBeLessThan(120);
    expect({
      settling,
      tuckAtThree: atThreeSeconds.tuck,
      tuckedEarly,
    }).toStrictEqual({
      settling: 0,
      tuckAtThree: 0,
      tuckedEarly: false,
    });
    expect(easingIn).toBeGreaterThan(0);
    expect(easingIn).toBeLessThan(0.2);
    expect(rider.tuck).toBe(1);
  });

  it("a tucked rider who steers stays tucked, a quarter of the way up at full lock, and comes back down when the bars straighten", () => {
    const state = alone(straight, bikes["halden-wren-400"]);
    const rider = player(state);
    hold(state, straight, { ...cruising, throttle: 1 }, 20);
    const onTheStraight = rider.tuck;
    rider.x = -3;
    hold(state, straight, { ...cruising, steer: 1, throttle: 1 }, 1);
    const atFullLock = { speed: rider.speed * KMH, tuck: rider.tuck };
    hold(state, straight, { ...cruising, steer: -1, throttle: 1 }, 0.4);
    const flicked = rider.tuck;
    hold(state, straight, { ...cruising, throttle: 1 }, 1.5);
    expect({ onTheStraight, straightAgain: rider.tuck }).toStrictEqual({
      onTheStraight: 1,
      straightAgain: 1,
    });
    expect(atFullLock.tuck).toBeGreaterThan(0.7);
    expect(atFullLock.tuck).toBeLessThan(0.8);
    expect(atFullLock.speed).toBeGreaterThan(150);
    expect(flicked).toBeGreaterThan(0.7);
  });

  it("a hard brake sits the rider up within a third of a second, and the tuck needs a fresh second and a half at speed before it eases back in", () => {
    const state = alone(straight, bikes["halden-wren-400"]);
    const rider = player(state);
    hold(state, straight, { ...cruising, throttle: 1 }, 20);
    const onTheStraight = rider.tuck;
    hold(state, straight, { ...cruising, brake: 1, throttle: 0 }, 0.3);
    const braked = { speed: rider.speed * KMH, tuck: rider.tuck };
    hold(state, straight, { ...cruising, throttle: 1 }, 1.4);
    const settling = rider.tuck;
    hold(state, straight, { ...cruising, throttle: 1 }, 0.6);
    const halfway = rider.tuck;
    hold(state, straight, { ...cruising, throttle: 1 }, 0.6);
    expect({ onTheStraight, settling, tuckedAgain: rider.tuck }).toStrictEqual({
      onTheStraight: 1,
      settling: 0,
      tuckedAgain: 1,
    });
    expect(braked.tuck).toBeLessThan(0.05);
    expect(braked.speed).toBeGreaterThan(120);
    expect(halfway).toBeGreaterThan(0.4);
    expect(halfway).toBeLessThan(0.6);
  });

  it("the pilot lifts for the Saddle on the fastest bike and lands without crashing", () => {
    const state = alone(quietTrack, bikes["ostra-nera-1000"]);
    const rider = player(state);
    rider.s = 1900;
    rider.speed = 70;
    rider.gear = 6;
    const input = { ...cruising, throttle: 0 };
    const events: RaceEvent[] = [];
    let launchSpeed = 0;
    for (let tick = 0; tick < 12 * TICK_RATE; tick += 1) {
      pilotInput(state, quietTrack, 0, input);
      stepRace(state, quietTrack, [input]);
      if (rider.airborne && launchSpeed === 0) {
        launchSpeed = rider.speed;
      }
      events.push(...state.events);
    }
    expect(events.some((event) => event.kind === "crash")).toBeFalsy();
    expect(events.some((event) => event.kind === "land")).toBeTruthy();
    expect(launchSpeed * KMH).toBeGreaterThan(170);
    expect(launchSpeed * KMH).toBeLessThan(205);
  });
});

describe("the grid", () => {
  it("the player starts behind every rival when the grid order puts them last", () => {
    const setup = defaultSetup(track, 1);
    const last = createRace({ ...setup, gridOrder: "playerLast" });
    const first = createRace({ ...setup, gridOrder: "playerFirst" });
    expect(rivalsOf(last)).toHaveLength(5);
    expect(player(last).s).toBeLessThan(Math.min(...rivalsOf(last)));
    expect(player(first).s).toBeGreaterThanOrEqual(
      Math.max(...rivalsOf(first))
    );
  });

  it("the player starts with the weapon and the hits left that the setup carries over", () => {
    const setup = defaultSetup(straight, 1);
    const state = createRace({
      ...setup,
      player: { ...setup.player, weapon: "chain", weaponHits: 3 },
      police: { ...setup.police, count: 0 },
      rivals: setup.rivals.slice(0, 2),
    });
    const me = riderAt(state, 0);
    const moose = riderAt(state, 2);
    riderAt(state, 1).s = 900;
    disarm(moose);
    for (const rider of [me, moose]) {
      rider.s = 50;
      rider.speed = 30;
    }
    expect([me.weapon, me.weaponHits]).toStrictEqual(["chain", 3]);
    const events = brawl(state, 8, () => {
      moose.stamina = MAX_STAMINA;
      return [pressing("punch", true), cruising, cruising];
    });
    expect(
      events.filter((event) => event.kind === "hit" && event.weapon === "chain")
    ).toHaveLength(3);
    expect(me.weapon).toBe("none");
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
  const me = riderAt(state, 0);
  me.s = 100;
  me.speed = kmh / KMH;
  me.stamina = 0;
  stepRace(state, straight, [cruising]);
  return FULL_CONDITION - me.condition;
};

const headOnAt = (kmh: number): number => {
  const state = field(straight, 1, 0, 0);
  const me = riderAt(state, 0);
  me.s = 100;
  oncomingCar(state);
  headOn(state, me, kmh / KMH, 8);
  return FULL_CONDITION - me.condition;
};

const crashesToWreck = (crash: (state: RaceState) => void): number => {
  const state = field(straight, 1, 0, 0);
  const me = riderAt(state, 0);
  me.s = 100;
  oncomingCar(state);
  while (me.mode !== "wrecked" && me.crashes < 20) {
    crash(state);
  }
  return me.crashes;
};

const knockOffAndRemount = (state: RaceState, kmh: number): void => {
  const me = riderAt(state, 0);
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
        headOn(state, riderAt(state, 0), 160 / KMH, 8);
      }),
      trafficAt200: crashesToWreck((state) => {
        headOn(state, riderAt(state, 0), 200 / KMH, 8);
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
    const me = riderAt(state, 0);
    const finisher = riderAt(state, 1);
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
    expect(standings(state)).toStrictEqual([1, 2, 0]);
  });

  it("the traffic drives on past a wreck that has come to rest", () => {
    const state = field(straight, 1, 0, 0);
    const me = riderAt(state, 0);
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

const knockedOffTrack = (ticksAfterPunch: number): RaceEvent[] => {
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
  return crashes;
};

describe("crash attribution", () => {
  it("a crash within a second of a punch names the rider who threw it, and a later one names nobody", () => {
    expect(knockedOffTrack(60)).toMatchObject([
      { by: 0, cause: "offTrack", rider: 2 },
    ]);
    expect(knockedOffTrack(61)).toMatchObject([
      { by: -1, cause: "offTrack", rider: 2 },
    ]);
  });

  it("a rider knocked down by punches is put down to the puncher, and a rider who falls alone to nobody", () => {
    const { moose, state } = sideBySide();
    moose.stamina = 10;
    const fight = brawl(state, 1, (tick) => [
      pressing("punch", tick === 0),
      cruising,
      cruising,
    ]);
    expect(fight.filter((event) => event.kind === "crash")).toMatchObject([
      { by: 0, cause: "combat", rider: 2 },
    ]);

    const solo = field(quietTrack, 1, 0, 0);
    player(solo).s = 100;
    player(solo).speed = 30;
    const fall = hold(solo, quietTrack, { ...cruising, steer: 1 }, 6);
    expect(fall.filter((event) => event.kind === "crash")).toMatchObject([
      { by: -1, rider: 0 },
    ]);
  });
});

const steerAway = (weapon: "none" | "sign", seconds: number): number => {
  const state = field(straight, 1, 0, 0);
  const rider = player(state);
  rider.speed = 40;
  arm(rider, weapon);
  hold(state, straight, { ...cruising, steer: 1, throttle: 0.6 }, seconds);
  return rider.lateralSpeed;
};

const reaches = (weapon: WeaponKind, across = 2.8): boolean => {
  const { moose, state } = sideBySide();
  arm(moose, weapon);
  const events: RaceEvent[] = [];
  for (let tick = 0; tick < TICK_RATE; tick += 1) {
    riderAt(state, 0).x = -1;
    moose.x = across - 1;
    moose.s = riderAt(state, 0).s;
    stepRace(state, straight, [
      cruising,
      cruising,
      pressing("punch", tick === 0),
    ]);
    events.push(...state.events);
  }
  return events.some((event) => event.kind === "hit");
};

const ticksBetweenHits = (weapon: WeaponKind): number => {
  const { moose, me, state } = sideBySide();
  arm(moose, weapon);
  const landedAt: number[] = [];
  brawl(state, 3, () => {
    me.stamina = MAX_STAMINA;
    if (state.events.some((event) => event.kind === "hit")) {
      landedAt.push(state.tick);
    }
    return [cruising, cruising, pressing("punch", true)];
  });
  const [first = 0, second = 0] = landedAt;
  return second - first;
};

const staminaLostTo = (weapon: "sign" | "club"): number => {
  const { moose, me, state } = sideBySide();
  arm(moose, weapon);
  brawl(state, 1, (tick) => [
    cruising,
    cruising,
    pressing("punch", tick === 0),
  ]);
  return MAX_STAMINA - me.stamina;
};

const ticksToLand = (weapon: WeaponKind, steer: number): number => {
  const { moose, me, state } = sideBySide();
  arm(moose, weapon);
  me.x = -0.5;
  let pressed = -1;
  let landed = -1;
  for (let tick = 0; tick < TICK_RATE; tick += 1) {
    moose.x = 1.8;
    moose.s = me.s;
    stepRace(state, straight, [
      { ...cruising, steer },
      cruising,
      pressing("punch", tick === 0),
    ]);
    for (const event of state.events) {
      if (event.kind === "attack" && event.rider === 2) {
        pressed = state.tick;
      }
      if (event.kind === "hit" && event.rider === 2) {
        landed = state.tick;
      }
    }
  }
  return landed < 0 ? -1 : landed - pressed;
};

describe("the new weapons", () => {
  it("a stop sign lands 27 ticks after the press, so a rider two metres across who steers away at once is out of reach, and a club lands at 7 before they can move", () => {
    expect({
      club: ticksToLand("club", 0),
      clubDodged: ticksToLand("club", -1),
      sign: ticksToLand("sign", 0),
      signDodged: ticksToLand("sign", -1),
    }).toStrictEqual({ club: 7, clubDodged: 7, sign: 27, signDodged: -1 });
  });

  it("a pool cue breaks after three hits", () => {
    const { moose, me, state } = sideBySide();
    arm(moose, "cue");
    const events = brawl(state, 10, () => {
      me.stamina = MAX_STAMINA;
      return [cruising, cruising, pressing("punch", true)];
    });
    expect(
      events.filter((event) => event.kind === "hit" && event.weapon === "cue")
    ).toHaveLength(3);
    expect(events).toContainEqual({
      kind: "weaponBroken",
      rider: 2,
      weapon: "cue",
    });
    expect(moose.weapon).toBe("none");
  });

  it("a pool cue reaches a rider 2.8 m across, where a club does not", () => {
    expect({ club: reaches("club"), cue: reaches("cue") }).toStrictEqual({
      club: false,
      cue: true,
    });
  });

  it("a pool cue has the longest reach, 3.3 m across where a chain falls short, and still not a full lane", () => {
    expect({
      chain: reaches("chain", 3.3),
      cue: reaches("cue", 3.3),
      cueAcrossTheLane: reaches("cue", 3.5),
    }).toStrictEqual({ chain: false, cue: true, cueAcrossTheLane: false });
  });

  it("a stop sign comes round again more slowly than any other weapon, and a pool cue fastest", () => {
    expect({
      club: ticksBetweenHits("club"),
      cue: ticksBetweenHits("cue"),
      sign: ticksBetweenHits("sign"),
    }).toStrictEqual({ club: 40, cue: 30, sign: 50 });
  });

  it("a stop sign hits harder than a club and its holder answers the bars more slowly", () => {
    expect(staminaLostTo("sign")).toBeGreaterThan(staminaLostTo("club"));
    expect(steerAway("sign", 0.05)).toBeLessThan(
      steerAway("none", 0.05) * 0.95
    );
    expect(steerAway("sign", 1.5)).toBeCloseTo(steerAway("none", 1.5), 1);
  });
});

const hitsByTheRival = (
  rival: RivalSetup,
  bystanderAcross: number,
  playerAcross = -1.2
) => {
  const setup = defaultSetup(straight, 1);
  const [, other] = setup.rivals;
  if (!other) {
    throw new Error("The default field has no second rival.");
  }
  const state = createRace({
    ...setup,
    police: { ...setup.police, count: 0 },
    rivals: [rival, other],
  });
  state.tick = 10 * TICK_RATE;
  const rivalInput = { ...cruising };
  const targets: number[] = [];
  for (let tick = 0; tick < 6 * TICK_RATE; tick += 1) {
    for (const rider of state.riders) {
      rider.s = 50;
      rider.speed = 30;
      rider.stamina = MAX_STAMINA;
    }
    riderAt(state, 0).x = playerAcross;
    riderAt(state, 1).x = 0;
    riderAt(state, 2).x = bystanderAcross;
    pilotInput(state, straight, 1, rivalInput);
    stepRace(state, straight, [cruising, rivalInput, cruising]);
    targets.push(
      ...state.events.flatMap((event) =>
        event.kind === "hit" && event.rider === 1 ? [event.target] : []
      )
    );
  }
  return targets;
};

describe("grudges", () => {
  it("a rival with a grudge attacks its target rather than a nearer rider when both are in reach", () => {
    const [dee] = defaultSetup(straight, 1).rivals;
    if (!dee) {
      throw new Error("The default field has no rival.");
    }
    const impartial = hitsByTheRival({ ...dee, aggression: 1 }, 2);
    const grudging = hitsByTheRival({ ...dee, aggression: 1, grudge: 2 }, 2);
    expect(impartial[0]).toBe(0);
    expect(grudging.length).toBeGreaterThan(0);
    expect(new Set(grudging)).toStrictEqual(new Set([2]));
  });

  it("a rival who is otherwise peaceful attacks the player it has a score to settle with, and nobody else", () => {
    const [dee] = defaultSetup(straight, 1).rivals;
    if (!dee) {
      throw new Error("The default field has no rival.");
    }
    const sore = { ...dee, aggression: 0, aggressionBoost: 1 };
    const alongside = hitsByTheRival(sore, 2);
    expect(alongside.length).toBeGreaterThan(0);
    expect(new Set(alongside)).toStrictEqual(new Set([0]));
    expect(hitsByTheRival(sore, 2, -12)).toStrictEqual([]);
  });

  it("a rival who has gone soft on the player leaves them alone and still fights the others", () => {
    const [dee] = defaultSetup(straight, 1).rivals;
    if (!dee) {
      throw new Error("The default field has no rival.");
    }
    const friendly = { ...dee, aggression: 1, aggressionBoost: -1 };
    const others = hitsByTheRival(friendly, 2, -12);
    expect(hitsByTheRival(friendly, 12)).toStrictEqual([]);
    expect(others.length).toBeGreaterThan(0);
    expect(new Set(others)).toStrictEqual(new Set([2]));
  });

  it("a grudge picks the target and leaves the rival's aggression toward that rider as it was", () => {
    const [dee] = defaultSetup(straight, 1).rivals;
    if (!dee) {
      throw new Error("The default field has no rival.");
    }
    const peaceful = { ...dee, aggression: 0, aggressionBoost: 1, grudge: 2 };
    expect(hitsByTheRival(peaceful, 2, -12)).toStrictEqual([]);
  });
});

const chase = (police: PoliceSetup, lead: number, quarrySpeed: number) => {
  const state = createRace({
    ...defaultSetup(straight, 1),
    police,
    rivals: [],
  });
  const me = riderAt(state, 0);
  const cop = patrolFrom(state, 1, 100);
  const copInput = { ...cruising };
  let pursued = false;
  let fastest = 0;
  for (let tick = 0; tick < 12 * TICK_RATE; tick += 1) {
    me.s = cop.s + lead;
    me.x = -1.8;
    me.speed = quarrySpeed;
    pilotInput(state, straight, 1, copInput);
    stepRace(state, straight, [cruising, copInput]);
    pursued ||= state.events.some((event) => event.kind === "pursuit");
    fastest = Math.max(fastest, cop.speed);
  }
  return { distance: chaserDistance(state, 0), fastest, pursued };
};

const rideToBody = (police: PoliceSetup) => {
  const state = createRace({
    ...defaultSetup(straight, 1),
    police,
    rivals: [],
  });
  const me = riderAt(state, 0);
  const cop = patrolFrom(state, 1, 150);
  cop.speed = 0;
  me.s = 190;
  me.speed = 15;
  me.stamina = 0;
  const copInput = { ...cruising };
  let fastest = 0;
  let ticksAfterTheBody = 0;
  for (let tick = 0; tick < 4 * TICK_RATE; tick += 1) {
    pilotInput(state, straight, 1, copInput);
    stepRace(state, straight, [cruising, copInput]);
    if (cop.chase === 0 && me.mode !== "riding") {
      fastest = Math.max(fastest, cop.speed);
      ticksAfterTheBody += 1;
    }
  }
  return { fastest, ticksAfterTheBody };
};

describe("police settings", () => {
  it("the number of cops and the fine come from the setup", () => {
    const police = { ...defaultPolice, count: 3, fine: 900 };
    const { events, state } = crashNearCop(150, police);
    const cops = state.riders.filter(
      (rider) => rider.profile.role === "police"
    );
    expect(cops.map((cop) => cop.profile.name)).toStrictEqual([
      "Sergeant Dolores Pike",
      "Sergeant Dolores Pike",
      "Sergeant Dolores Pike",
    ]);
    expect(events).toContainEqual(
      expect.objectContaining({
        cop: 1,
        fine: 900,
        kind: "busted",
        rider: 0,
      })
    );
  });

  it("a cop sees as far as the setup says and no further", () => {
    const near = chase({ ...defaultPolice, sightRange: 40 }, 50, PATROL_SPEED);
    const far = chase({ ...defaultPolice, sightRange: 60 }, 50, PATROL_SPEED);
    expect({ distance: near.distance, pursued: near.pursued }).toStrictEqual({
      distance: -1,
      pursued: false,
    });
    expect(far.pursued).toBeTruthy();
    expect(far.distance).toBeGreaterThan(45);
    expect(far.distance).toBeLessThan(55);
  });

  it("a cop riding to a downed rider keeps to the pursuit speed the setup allows", () => {
    const slow = rideToBody({ ...defaultPolice, topSpeed: 10 });
    const quick = rideToBody(defaultPolice);
    expect(slow.ticksAfterTheBody).toBeGreaterThan(TICK_RATE);
    expect(slow.fastest).toBeGreaterThan(8);
    expect(slow.fastest).toBeLessThan(11);
    expect(quick.fastest).toBeGreaterThan(slow.fastest + 3);
  });

  it("a cop in pursuit rides no faster than the setup allows", () => {
    const slow = chase({ ...defaultPolice, topSpeed: 40 }, 15, 70);
    const quick = chase({ ...defaultPolice, topSpeed: 48 }, 15, 70);
    expect(slow.fastest).toBeGreaterThan(38);
    expect(slow.fastest).toBeLessThan(42);
    expect(quick.fastest).toBeGreaterThan(46);
    expect(quick.fastest).toBeLessThan(50);
  });
});

const fullGrid = (course: Track, seed: number): RaceState => {
  const setup = defaultSetup(course, seed);
  return createRace({
    ...setup,
    player: { ...setup.player, bike: bikes["halden-wren-400"] },
    rivals: cast
      .filter((rival) => rival.racesFrom <= 1)
      .slice(0, 14)
      .map((rival) => rivalAt(rival, 1)),
  });
};

const launch = (state: RaceState, course: Track, seconds: number) => {
  const inputs = state.riders.map(() => ({ ...neutralInput }));
  const crashes: { rider: number; tick: number }[] = [];
  for (let tick = 0; tick < seconds * TICK_RATE; tick += 1) {
    for (const [index, input] of inputs.entries()) {
      if (index === 0) {
        Object.assign(input, { ...neutralInput, throttle: 1 });
      } else {
        pilotInput(state, course, index, input);
      }
    }
    stepRace(state, course, inputs);
    crashes.push(
      ...state.events.flatMap((event) =>
        event.kind === "crash" ? [{ rider: event.rider, tick }] : []
      )
    );
  }
  return crashes;
};

describe("the start", () => {
  it.each([
    { course: track, lanes: "one lane each way" },
    { course: wideTrack, lanes: "two lanes each way" },
  ])(
    "a player who holds full throttle from the back of a fifteen-rider grid is not thrown in the first ten seconds, and no rival goes down in the first three, with $lanes",
    ({ course }) => {
      for (const seed of [1, 2, 3]) {
        const state = fullGrid(course, seed);
        const crashes = launch(state, course, 10);
        expect(crashes.filter((crash) => crash.rider === 0)).toStrictEqual([]);
        expect(
          crashes.filter((crash) => crash.tick < 3 * TICK_RATE)
        ).toStrictEqual([]);
        expect(player(state).s).toBeGreaterThan(120);
      }
    }
  );

  it("the pack gets away on its own bikes' curves: three seconds in, the rider ahead of the player is within four metres a second of the player", () => {
    const state = fullGrid(wideTrack, 1);
    const me = player(state);
    launch(state, wideTrack, 3);
    const [ahead] = state.riders
      .slice(1)
      .filter(
        (rider) =>
          rider.profile.role === "racer" &&
          rider.s > me.s &&
          Math.abs(rider.x - me.x) < 1
      )
      .toSorted((left, right) => left.s - right.s);
    if (!ahead) {
      throw new Error("Nobody is ahead of the player in their lane.");
    }
    expect(me.speed).toBeGreaterThan(10);
    expect(me.speed - ahead.speed).toBeLessThan(4);
  });
});

const loadingRamp = {
  kind: "jump",
  length: 16,
  rise: 0.8,
  width: 1.4,
} as const;
const rampRoadPlan = {
  ...ridgeRoad,
  features: [
    {
      feature: loadingRamp,
      fromLevel: 1,
      id: "middle-ramp",
      placement: "fixed",
      s: 1000,
      x: 0,
    },
    {
      feature: loadingRamp,
      fromLevel: 1,
      id: "edge-ramp",
      placement: "fixed",
      s: 2000,
      x: 3.8,
    },
  ],
  sections: [{ climb: 0, length: 6000, turnDegrees: 0 }],
  trafficPerKilometre: 0,
} as const;
const rampRoad = compileTrack(rampRoadPlan);
const wideRampRoad = compileTrack({ ...rampRoadPlan, lanesEachWay: 2 });
const offCentreRampRoad = compileTrack({
  ...rampRoadPlan,
  features: [{ ...rampRoadPlan.features[0], x: 3.5 }],
});
const flatOut: RiderInput = {
  brake: 0,
  kick: false,
  punch: false,
  steer: 0,
  throttle: 1,
};

const jumpFrom = (
  s: number,
  x: number,
  speed: number,
  steering: number,
  road: Track = rampRoad
) => {
  const state = field(road, 1, 0, 0);
  const rider = player(state);
  rider.s = s;
  rider.x = x;
  rider.speed = speed;
  rider.lateralSpeed = steering * lateralSpeedLimit(rider.bike, speed);
  const events: RaceEvent[] = [];
  let takeoff = -1;
  let touchdown = -1;
  let touchdownX = Number.NaN;
  let speedBefore = 0;
  let speedAfter = 0;
  for (let tick = 0; tick < 4 * TICK_RATE; tick += 1) {
    const { airborne: flying, speed: pace } = rider;
    stepRace(state, road, [{ ...flatOut, steer: Math.sign(steering) }]);
    events.push(...state.events);
    if (!flying && rider.airborne && takeoff < 0) {
      takeoff = rider.s;
    }
    if (flying && !rider.airborne) {
      touchdownX = rider.mode === "riding" ? rider.x : rider.bodyX;
    }
    if (state.events.some((event) => event.kind === "land")) {
      touchdown = rider.s;
      speedBefore = pace;
      speedAfter = rider.speed;
    }
  }
  return {
    crashes: events.filter((event) => event.kind === "crash"),
    events,
    flights: events.filter((event) => event.kind === "land"),
    speedAfter,
    speedBefore,
    takeoff,
    touchdown,
    touchdownX,
  };
};

interface Placement {
  readonly s: number;
  readonly x: number;
  readonly speed: number;
  readonly lateralSpeed: number;
  readonly air?: number;
  readonly verticalSpeed?: number;
  readonly airborne?: boolean;
  readonly steer?: number;
}

const besideRamp = (
  placement: Placement,
  ticks: number,
  road: Track = rampRoad
) => {
  const state = field(road, 1, 0, 0);
  const rider = player(state);
  rider.s = placement.s;
  rider.x = placement.x;
  rider.speed = placement.speed;
  rider.lateralSpeed = placement.lateralSpeed;
  rider.airborne = placement.airborne ?? placement.air !== undefined;
  rider.air = placement.air ?? 0;
  rider.verticalSpeed = placement.verticalSpeed ?? 0;
  const steer = placement.steer ?? Math.sign(placement.lateralSpeed);
  const events: RaceEvent[] = [];
  for (let tick = 0; tick < ticks; tick += 1) {
    stepRace(state, road, [{ ...flatOut, steer }]);
    events.push(...state.events);
  }
  return { events, rider, state };
};

const dropOnto = (metres: number): RaceEvent[] => {
  const state = field(rampRoad, 1, 0, 0);
  const rider = player(state);
  rider.s = 3000;
  rider.speed = 40;
  rider.airborne = true;
  rider.air = metres;
  return hold(state, rampRoad, flatOut, 2).filter(
    (event) => event.kind === "crash"
  );
};

const overSlagRowHump = (speed: number, throttle: number): RaceEvent[] => {
  const state = field(quietSlagRow, 1, 0, 0);
  const rider = player(state);
  rider.s = 3940;
  rider.speed = speed;
  const events: RaceEvent[] = [];
  for (let tick = 0; tick < 4 * TICK_RATE && rider.s < 4300; tick += 1) {
    stepRace(state, quietSlagRow, [{ ...flatOut, throttle }]);
    events.push(...state.events);
  }
  return events;
};

describe("jumping", () => {
  it("a loading ramp taken flat out at 180 km/h throws the bike about 60 m from the lip and it lands straight and rides on", () => {
    const jump = jumpFrom(900, 0, 50, 0);
    expect(jump.crashes).toHaveLength(0);
    expect(jump.flights).toHaveLength(1);
    expect(Math.abs(jump.takeoff - 1016.5)).toBeLessThan(1);
    expect(Math.abs(jump.touchdown - 1016 - 62)).toBeLessThan(13);
  });

  it("a straight landing costs a little speed, not a lot", () => {
    const jump = jumpFrom(900, 0, 50, 0);
    const kept = jump.speedAfter / jump.speedBefore;
    expect(kept).toBeGreaterThan(0.9);
    expect(kept).toBeLessThan(0.99);
  });

  it("a bike still steering hard when it leaves the lip lands leaned over on the tarmac and crashes; a gentle drift lands", () => {
    const leaned = jumpFrom(1012, -0.2, 50, 0.75, wideRampRoad);
    const drifting = jumpFrom(1012, -0.2, 50, 0.3, wideRampRoad);
    expect(leaned.crashes.map((crash) => crash.cause)).toStrictEqual([
      "landing",
    ]);
    expect(Math.abs(leaned.touchdownX)).toBeLessThan(
      wideRampRoad.roadHalfWidth - 1
    );
    expect(drifting.crashes).toHaveLength(0);
    expect(drifting.flights).toHaveLength(1);
  });

  it("the same gentle drift off a ramp at the road edge lands on the verge and crashes", () => {
    const jump = jumpFrom(2012, 3.8, 50, 0.3);
    expect(jump.crashes.map((crash) => crash.cause)).toStrictEqual(["landing"]);
  });

  it("swerving sharply into the side of a ramp throws the rider", () => {
    const swerve = jumpFrom(1010, 0.9, 40, -0.8);
    expect(swerve.crashes.map((crash) => crash.cause)).toStrictEqual(["prop"]);
  });

  it("brushing the side of a ramp glances off it: the rider stays beside it on the ground and rides on", () => {
    const brush = field(rampRoad, 1, 0, 0);
    const rider = player(brush);
    rider.s = 1010;
    rider.x = 0.75;
    rider.speed = 40;
    rider.lateralSpeed = -0.9;
    const events = hold(brush, rampRoad, { ...flatOut, steer: -0.05 }, 0.12);
    expect(rider.s).toBeLessThan(1016);
    expect(events.map((event) => event.kind)).toContain("glance");
    expect(events.some((event) => event.kind === "crash")).toBeFalsy();
    expect(rider.x).toBeGreaterThan(0.7);
    expect(rider.airborne).toBeFalsy();
  });

  it("cutting across the side of a ramp just short of its lip hits the side instead of passing through it", () => {
    const cut = besideRamp(
      { lateralSpeed: -4, s: 1015.6, speed: 60, x: 0.72 },
      1
    );
    expect(
      cut.events.map((event) => event.kind === "crash" && event.cause)
    ).toStrictEqual(["prop"]);
  });

  it("cutting in from exactly the edge line of a ramp just short of its lip hits the side, the same as cutting in from beside it", () => {
    const cut = besideRamp(
      { lateralSpeed: -4, s: 1015.6, speed: 60, x: 0.7 },
      1
    );
    expect(
      cut.events.map((event) => event.kind === "crash" && event.cause)
    ).toStrictEqual(["prop"]);
  });

  it("a bike skimming low from exactly the edge line of a ramp glances off its side instead of popping up onto the deck", () => {
    const skim = besideRamp(
      {
        air: 0.1,
        lateralSpeed: -0.8,
        s: 1010,
        speed: 40,
        verticalSpeed: 0,
        x: 0.7,
      },
      3
    );
    expect(skim.events.map((event) => event.kind)).toStrictEqual(["glance"]);
    expect(skim.rider.air).toBeLessThan(0.2);
    expect(skim.rider.x).toBeGreaterThanOrEqual(0.7);
  });

  it("a rider who glances off a ramp from exactly its edge line and lets go of the bars rides on along its side on the ground", () => {
    const brush = besideRamp(
      { lateralSpeed: -0.5, s: 1008, speed: 20, x: 0.7 },
      1
    );
    const events = [
      ...brush.events,
      ...hold(brush.state, rampRoad, flatOut, 0.25),
    ];
    expect(events.map((event) => event.kind)).toStrictEqual(["glance"]);
    expect(brush.rider.s).toBeLessThan(1016);
    expect(brush.rider.air).toBe(0);
    expect(brush.rider.airborne).toBeFalsy();
  });

  it("a rider drifting across a ramp's deck onto its edge line rides on along the deck instead of dropping to the road", () => {
    const drift = besideRamp(
      {
        air: 0.3125,
        airborne: false,
        lateralSpeed: 1 / 6,
        s: 1010,
        speed: 40,
        steer: 0,
        x: 0.7 - 1 / 720,
      },
      2
    );
    const deckHeight =
      loadingRamp.rise * ((drift.rider.s - 1000) / loadingRamp.length) ** 2;
    expect(drift.events).toStrictEqual([]);
    expect(drift.rider.x).toBeCloseTo(0.7, 6);
    expect(drift.rider.air).toBeCloseTo(deckHeight, 6);
  });

  it("a rider riding up a ramp exactly along its edge line leaves the lip the same as one up the middle", () => {
    const deck = { air: 0.7605, airborne: false, s: 1015.6, speed: 60 };
    const edge = besideRamp({ ...deck, lateralSpeed: 0, x: 0.7 }, 1);
    const middle = besideRamp({ ...deck, lateralSpeed: 0, x: 0 }, 1);
    expect(middle.rider.airborne).toBeTruthy();
    expect(edge.rider.airborne).toBeTruthy();
    expect(edge.rider.air).toBe(middle.rider.air);
  });

  it("a rider who steers off the side of a ramp's deck falls from the deck instead of dropping straight to the road", () => {
    const off = besideRamp(
      {
        air: 0.3125,
        airborne: false,
        lateralSpeed: 3,
        s: 1010,
        speed: 40,
        x: 0.69,
      },
      1
    );
    expect(off.rider.x).toBeGreaterThan(0.7);
    expect(off.rider.airborne).toBeTruthy();
    expect(off.rider.air).toBeGreaterThan(0.25);
  });

  it("a rider on the road who steers away from exactly a ramp's edge line stays on the road", () => {
    const away = besideRamp({ lateralSpeed: 2, s: 1010, speed: 40, x: 0.7 }, 3);
    expect(away.events).toStrictEqual([]);
    expect(away.rider.airborne).toBeFalsy();
    expect(away.rider.air).toBe(0);
  });

  it("a bike dropping past a ramp just below its deck, exactly on its edge line, falls on past it instead of being pulled up onto the deck", () => {
    const fall = besideRamp(
      {
        air: 0.25,
        lateralSpeed: 0,
        s: 1010,
        speed: 40,
        verticalSpeed: -10,
        x: 0.7,
      },
      1
    );
    expect(fall.events).toStrictEqual([]);
    expect(fall.rider.airborne).toBeTruthy();
    expect(fall.rider.air).toBeLessThan(0.25);
  });

  it("a bike that comes down onto a ramp's deck hard at the very end of a tick crashes on the deck instead of sinking through it to the road", () => {
    const sink = besideRamp(
      {
        air: 0.47309638888888766,
        lateralSpeed: 0,
        s: 1009.48,
        speed: 40,
        verticalSpeed: -9,
        x: 0,
      },
      6
    );
    expect(
      sink.events.map((event) => event.kind === "crash" && event.cause)
    ).toStrictEqual(["landing"]);
  });

  it("a hard landing on the edge of a ramp off the middle of the road crashes the same as one on a ramp in the middle", () => {
    const alongDeck = 10 / loadingRamp.length;
    const landing = {
      air: loadingRamp.rise * alongDeck * alongDeck,
      lateralSpeed: -0.8,
      s: 1010,
      speed: 40,
      verticalSpeed: -10,
    };
    const centred = besideRamp({ ...landing, x: 0.7 }, 3);
    const offCentre = besideRamp({ ...landing, x: 4.2 }, 3, offCentreRampRoad);
    expect(
      centred.events.map((event) => event.kind === "crash" && event.cause)
    ).toStrictEqual(["landing"]);
    expect(offCentre.events).toStrictEqual(centred.events);
  });

  it("a bike coming down onto a ramp just short of its lip touches down on the deck instead of falling through it", () => {
    const drop = besideRamp(
      {
        air: 0.79,
        lateralSpeed: 0,
        s: 1015.5,
        speed: 60,
        verticalSpeed: -3,
        x: 0,
      },
      1
    );
    expect(drop.events.map((event) => event.kind)).toStrictEqual(["land"]);
  });

  it("a bike skimming low beside a ramp glances off its side instead of popping up onto the deck", () => {
    const skim = besideRamp(
      {
        air: 0.1,
        lateralSpeed: -0.8,
        s: 1010,
        speed: 40,
        verticalSpeed: 0,
        x: 0.71,
      },
      3
    );
    expect(skim.events.map((event) => event.kind)).toStrictEqual(["glance"]);
    expect(skim.rider.air).toBeLessThan(0.2);
    expect(skim.rider.x).toBeGreaterThan(0.7);
  });

  it("a bike that drops eight metres onto the road crashes however straight it lands; a two metre drop is ridden out", () => {
    expect(
      dropOnto(8).map((crash) => crash.kind === "crash" && crash.cause)
    ).toStrictEqual(["landing"]);
    expect(dropOnto(2)).toHaveLength(0);
  });

  it("Slag Row's hump is ridden over on the ground at 130 km/h and gives a short hop flat out", () => {
    const cruise = overSlagRowHump(36, 0.6);
    const flat = overSlagRowHump(53, 1);
    expect(cruise.some((event) => event.kind === "land")).toBeFalsy();
    const hops = flat.filter((event) => event.kind === "land");
    expect(hops).toHaveLength(1);
    expect(hops[0]?.kind === "land" && hops[0].airSeconds).toBeGreaterThan(0.1);
    expect(hops[0]?.kind === "land" && hops[0].airSeconds).toBeLessThan(1);
    expect(flat.some((event) => event.kind === "crash")).toBeFalsy();
  });

  it("computer riders line up on a ramp and land it, and the odd unsure one misjudges it and goes down", () => {
    let jumped = 0;
    let passed = 0;
    let downAtRamp = 0;
    for (let seed = 1; seed <= 24; seed += 1) {
      const state = field(rampRoad, seed, 6, 0);
      const inputs = state.riders.map(() => ({ ...neutralInput }));
      for (let tick = 0; tick < 60 * TICK_RATE; tick += 1) {
        for (const [index, input] of inputs.entries()) {
          pilotInput(state, rampRoad, index, input);
        }
        const before = state.riders.map((rider) => rider.s);
        stepRace(state, rampRoad, inputs);
        for (const [index, rider] of state.riders.entries()) {
          if ((before[index] ?? 0) <= 1016 && rider.s > 1016) {
            passed += 1;
            jumped += rider.airborne ? 1 : 0;
          }
        }
        for (const event of state.events) {
          const crashed =
            event.kind === "crash" ? state.riders[event.rider] : undefined;
          if (crashed && crashed.s > 990 && crashed.s < 1100) {
            downAtRamp += 1;
          }
        }
        if (state.riders.every((rider) => rider.s > 1200)) {
          break;
        }
      }
    }
    expect(passed).toBeGreaterThan(140);
    expect(jumped / passed).toBeGreaterThan(0.75);
    expect(downAtRamp).toBeGreaterThan(0);
    expect(downAtRamp / passed).toBeLessThan(0.1);
  });
});

const hazardFreeRoad = compileTrack({
  ...ridgeRoad,
  features: [],
  hazardsPerKilometre: 0,
  sections: [{ climb: 0, length: 6000, turnDegrees: 0 }],
  trafficPerKilometre: 0,
});

const roadWith = (...hazards: readonly HazardPlacement[]): Track => ({
  ...hazardFreeRoad,
  hazards,
});

const placedAt = (
  kind: HazardPlacement["kind"],
  s: number,
  x: number,
  id: string
): HazardPlacement => ({ fromLevel: 1, id, kind, s, x });

const rideAt = (
  road: Track,
  from: Placement,
  steerFrom: number,
  steer: number,
  seconds: number
) => {
  const state = field(road, 1, 0, 0);
  const rider = player(state);
  rider.s = from.s;
  rider.x = from.x;
  rider.speed = from.speed;
  rider.lateralSpeed = from.lateralSpeed;
  const events: RaceEvent[] = [];
  let shakiest = 0;
  let highest = 0;
  for (let tick = 0; tick < seconds * TICK_RATE; tick += 1) {
    stepRace(state, road, [
      { ...flatOut, steer: rider.s > steerFrom ? steer : 0 },
    ]);
    events.push(...state.events);
    shakiest = Math.max(shakiest, rider.wobble);
    highest = Math.max(highest, rider.airborne ? rider.air : 0);
  }
  return {
    crashes: events.flatMap((event) => (event.kind === "crash" ? [event] : [])),
    events,
    highest,
    rider,
    shakiest,
  };
};

const slick = roadWith(placedAt("oil", 1000, 1.8, "slick"));
const boulder = roadWith(placedAt("rock", 1000, 1.8, "boulder"));
const hole = roadWith(placedAt("pothole", 1000, 1.8, "hole"));

const atSpeed = (kmh: number): Placement => ({
  lateralSpeed: 0,
  s: 996 - (0.6 * kmh) / KMH,
  speed: kmh / KMH,
  x: 1.8,
});

const effectsOf = (events: readonly RaceEvent[]): string[] =>
  events.flatMap((event) => (event.kind === "hazard" ? [event.effect] : []));

interface Trace {
  readonly s: number;
  readonly x: number;
}

const pilotFrom = (
  state: RaceState,
  road: Track,
  seconds: number,
  beforeTick?: (tick: number) => void
) => {
  const rider = player(state);
  const input = { ...neutralInput };
  const events: RaceEvent[] = [];
  const line: Trace[] = [];
  const slippingSteer: number[] = [];
  for (let tick = 0; tick < seconds * TICK_RATE; tick += 1) {
    beforeTick?.(tick);
    pilotInput(state, road, 0, input);
    stepRace(state, road, [input]);
    events.push(...state.events);
    line.push({ s: rider.s, x: rider.x });
    if (rider.slip > 0) {
      slippingSteer.push(Math.abs(input.steer));
    }
  }
  return { events, line, rider, slippingSteer };
};

const pilotAt = (road: Track, s: number, seconds: number) => {
  const state = field(road, 1, 0, 0);
  const rider = player(state);
  rider.s = s;
  rider.x = 1.8;
  rider.speed = 170 / KMH;
  return pilotFrom(state, road, seconds);
};

const crossingAt = (line: readonly Trace[], s: number): number =>
  line.find((point) => point.s >= s)?.x ?? Number.NaN;

const acrossInHalfASecond = (road: Track): number => {
  const run = rideAt(road, { ...atSpeed(90), s: 994 }, 996, 0.5, 0.5);
  return Math.abs(run.rider.x - 1.8);
};

const leaned = (kmh: number) => {
  const speed = kmh / KMH;
  const sideways = lateralSpeedLimit(streetBike, speed);
  return rideAt(
    hole,
    {
      lateralSpeed: sideways,
      s: 996 - 0.6 * speed,
      speed,
      x: 1.8 - 0.6 * sideways,
    },
    0,
    1,
    1.5
  ).crashes.map((crash) => crash.hazard?.id);
};

const slowTruckAt = (state: RaceState, s: number, x: number): void => {
  state.cars.push({
    cruiseSpeed: 10,
    halfLength: 4.2,
    halfWidth: 1.2,
    height: 3.1,
    paint: 1,
    s,
    speed: 10,
    x,
  });
};

interface Closing {
  readonly truckS: number;
  readonly speed: number;
  readonly x: number;
}

const closingOnTruck: Closing = { speed: 45, truckS: 970, x: 1.8 };
const fastOnTruck: Closing = { speed: 65, truckS: 980, x: 1.8 };

const escapes: readonly (readonly [string, Closing, HazardPlacement])[] = [
  [
    "a rock level with the truck",
    closingOnTruck,
    placedAt("rock", 970, -0.6, "level"),
  ],
  [
    "a pothole on the line it starts on",
    { speed: 35, truckS: 960, x: 2.6 },
    placedAt("pothole", 960, 2.4, "underfoot"),
  ],
];

const pilotBehindTruck = (road: Track, closing = closingOnTruck) => {
  const state = field(road, 1, 0, 0);
  slowTruckAt(state, closing.truckS, 1.8);
  const rider = player(state);
  rider.s = 920;
  rider.x = closing.x;
  rider.speed = closing.speed;
  return pilotFrom(state, road, 6);
};

const copBehindTruck = (road: Track, closing = closingOnTruck) => {
  const state = field(road, 1, 0, 1);
  slowTruckAt(state, closing.truckS, 1.8);
  const cop = riderAt(state, 1);
  cop.parked = false;
  cop.post = 900;
  cop.chase = 0;
  cop.s = 920;
  cop.x = closing.x;
  cop.speed = closing.speed;
  const target = player(state);
  target.s = 935;
  target.x = -3;
  target.speed = closing.speed;
  const inputs = state.riders.map(() => ({ ...neutralInput }));
  const events: RaceEvent[] = [];
  for (let tick = 0; tick < 4 * TICK_RATE; tick += 1) {
    pilotInput(state, road, 1, inputs[1] ?? { ...neutralInput });
    inputs[0] = { ...neutralInput, throttle: 0.6 };
    stepRace(state, road, inputs);
    events.push(...state.events);
  }
  return events.filter((event) => event.rider === 1);
};

const diceAfterPiloting = (road: Track): number => {
  const state = field(road, 1, 0, 0);
  const rider = player(state);
  rider.s = 800;
  rider.x = 1.8;
  rider.speed = 170 / KMH;
  pilotFrom(state, road, 3);
  return state.dice;
};

const climbThenFlat = compileTrack({
  ...ridgeRoad,
  features: [],
  hazardsPerKilometre: 0,
  sections: [
    { climb: 100, length: 2000, turnDegrees: 0 },
    { climb: 0, length: 4000, turnDegrees: 0 },
  ],
  trafficPerKilometre: 0,
});

const rockOn = (road: Track, kmh: number) =>
  rideAt(
    { ...road, hazards: [placedAt("rock", 1000, 1.8, "boulder")] },
    { lateralSpeed: 0, s: 998.5, speed: kmh / KMH, x: 1.8 },
    0,
    0,
    3
  );

const downed = (events: readonly RaceEvent[]): RaceEvent[] =>
  events.filter((event) => event.kind === "crash");

const steeringHardInto = (kmh: number) => {
  const speed = kmh / KMH;
  const sideways = lateralSpeedLimit(streetBike, speed);
  return rideAt(
    boulder,
    {
      lateralSpeed: sideways,
      s: 996 - 0.6 * speed,
      speed,
      x: 1.8 - 0.6 * sideways,
    },
    0,
    1,
    3
  );
};

describe("road hazards", () => {
  it("a rider who holds a steady line straight over an oil slick at 220 km/h stays up and keeps nearly all their speed", () => {
    const run = rideAt(slick, atSpeed(220), 0, 0, 2);
    const smooth = rideAt(hazardFreeRoad, atSpeed(220), 0, 0, 2);
    expect(run.crashes).toStrictEqual([]);
    expect(effectsOf(run.events)).toStrictEqual(["slip"]);
    expect(run.rider.speed / smooth.rider.speed).toBeGreaterThan(0.95);
  });

  it("full lock across an oil slick at 180 km/h puts the rider down and the crash names the slick; at 70 km/h the bike only slides", () => {
    const fast = rideAt(slick, atSpeed(180), 995, 1, 2);
    expect(
      fast.crashes.map((crash) => [crash.cause, crash.hazard?.id])
    ).toStrictEqual([["hazard", "slick"]]);
    const slow = rideAt(slick, atSpeed(70), 995, 1, 2);
    expect(slow.crashes).toStrictEqual([]);
  });

  it("on oil the bars barely bite: half lock moves the bike less than half as far across the road in the next half second", () => {
    expect(acrossInHalfASecond(slick)).toBeLessThan(
      acrossInHalfASecond(hazardFreeRoad) * 0.5
    );
  });

  it.each([130, 150])(
    "a rock hit square at %i km/h bumps the bike into the air, and it lands wobbling, slower, and rides on",
    (kmh) => {
      const run = rideAt(boulder, atSpeed(kmh), 0, 0, 3);
      const smooth = rideAt(hazardFreeRoad, atSpeed(kmh), 0, 0, 3);
      expect({
        crashes: run.crashes,
        effects: effectsOf(run.events),
        mode: run.rider.mode,
      }).toStrictEqual({ crashes: [], effects: ["bump"], mode: "riding" });
      const landing = run.events.find((event) => event.kind === "land");
      expect(landing?.kind === "land" && landing.airSeconds).toBeGreaterThan(
        0.3
      );
      expect(run.shakiest).toBeGreaterThan(0.3);
      const lost = 1 - run.rider.speed / smooth.rider.speed;
      expect(lost).toBeGreaterThan(0.05);
      expect(lost).toBeLessThan(0.25);
    }
  );

  it("a rock hit square at 220 km/h launches the bike, and the landing throws the rider with the crash naming the rock", () => {
    const fast = rideAt(boulder, atSpeed(220), 0, 0, 3);
    expect(effectsOf(fast.events)).toStrictEqual(["bump"]);
    expect(
      fast.crashes.map((crash) => [crash.cause, crash.hazard?.id])
    ).toStrictEqual([["hazard", "boulder"]]);
  });

  it("a rock hit at 160 km/h while steering hard throws the rider, though the same rock ridden straight at 160 km/h does not", () => {
    const hard = steeringHardInto(160);
    expect(effectsOf(hard.events)).toStrictEqual(["bump"]);
    expect(hard.crashes.map((crash) => crash.hazard?.id)).toStrictEqual([
      "boulder",
    ]);
    expect(rideAt(boulder, atSpeed(160), 0, 0, 3).crashes).toStrictEqual([]);
  });

  it("a rock hit at 30 km/h is a stagger that costs over half the speed, and the rider rides on past it", () => {
    const state = field(boulder, 1, 0, 0);
    const slow = player(state);
    Object.assign(slow, atSpeed(30));
    const events = hold(state, boulder, { ...flatOut, throttle: 0 }, 2.5);
    expect(events.filter((event) => event.kind === "crash")).toStrictEqual([]);
    expect(effectsOf(events)).toStrictEqual(["stagger"]);
    const stagger = events.find((event) => event.kind === "hazard");
    expect(stagger?.kind === "hazard" && stagger.speed).toBeLessThan(
      (30 / KMH) * 0.5
    );
    expect(slow.mode).toBe("riding");
    expect(slow.s).toBeGreaterThan(1000 + hazardSizes.rock.halfLength);
  });

  it("a rider who passes a rock close at speed gets a near miss naming it, and one who only clips its edge stays up", () => {
    const touching = 1.8 + hazardSizes.rock.halfWidth + BIKE_HALF_WIDTH;
    const close = rideAt(
      boulder,
      { ...atSpeed(150), x: touching + 0.3 },
      0,
      0,
      1
    );
    expect(close.crashes).toStrictEqual([]);
    expect(
      close.events.flatMap((event) =>
        event.kind === "nearMiss" ? [event.hazard?.id] : []
      )
    ).toStrictEqual(["boulder"]);
    const clipped = rideAt(
      boulder,
      { ...atSpeed(150), x: touching - 0.08 },
      0,
      0,
      1
    );
    expect(clipped.crashes).toStrictEqual([]);
    expect(effectsOf(clipped.events)).toStrictEqual(["stagger"]);
  });

  it("a pothole at 180 km/h is a jolt that costs a few per cent of the speed, and the rider rides on", () => {
    const run = rideAt(hole, atSpeed(180), 0, 0, 1.6);
    expect(run.crashes).toStrictEqual([]);
    expect(effectsOf(run.events)).toStrictEqual(["jolt"]);
    const lost =
      1 -
      rideAt(hole, atSpeed(180), 0, 0, 0.7).rider.speed /
        rideAt(hazardFreeRoad, atSpeed(180), 0, 0, 0.7).rider.speed;
    expect(lost).toBeGreaterThan(0.03);
    expect(lost).toBeLessThan(0.08);
  });

  it("a pothole shakes the bike for under a second and leaves it steady", () => {
    const run = rideAt(hole, atSpeed(180), 0, 0, 1.6);
    expect(run.shakiest).toBeGreaterThan(0.25);
    expect(run.rider.wobble).toBe(0);
  });

  it("a pothole hit leaned hard over at 240 km/h throws the rider, and the same lean at 150 km/h only shakes the bike", () => {
    expect(leaned(240)).toStrictEqual(["hole"]);
    expect(leaned(150)).toStrictEqual([]);
  });

  it("a bike in the air flies over a rock untouched", () => {
    const state = field(boulder, 1, 0, 0);
    const rider = player(state);
    rider.s = 990;
    rider.x = 1.8;
    rider.speed = 40;
    rider.airborne = true;
    rider.air = 1.5;
    rider.verticalSpeed = 2;
    const events = hold(state, boulder, flatOut, 0.5);
    expect(
      events.filter(
        (event) => event.kind === "hazard" || event.kind === "crash"
      )
    ).toStrictEqual([]);
  });

  it("the pilot rides round a rock in its lane at 170 km/h and stays up", () => {
    const run = pilotAt(boulder, 800, 6);
    expect(run.events.filter((event) => event.kind === "crash")).toStrictEqual(
      []
    );
    expect(Math.abs(crossingAt(run.line, 1000) - 1.8)).toBeGreaterThan(
      hazardSizes.rock.halfWidth + BIKE_HALF_WIDTH
    );
  });

  it("the pilot rides round an oil slick it sees in time, and holds a straight line across one it meets too late", () => {
    const seen = pilotAt(slick, 800, 6);
    expect(effectsOf(seen.events)).toStrictEqual([]);
    const late = pilotAt(slick, 985, 2);
    expect(effectsOf(late.events)).toStrictEqual(["slip"]);
    expect(late.events.filter((event) => event.kind === "crash")).toStrictEqual(
      []
    );
    expect(Math.max(...late.slippingSteer)).toBeLessThan(0.6);
  });

  it("a rock spawned in the pilot's lane mid-race is ridden round exactly like one on the track's schedule", () => {
    const scheduled = pilotAt(
      roadWith(placedAt("rock", 1000, 1.8, "drop")),
      800,
      6
    );
    const state = field(hazardFreeRoad, 1, 0, 0);
    const rider = player(state);
    rider.s = 800;
    rider.x = 1.8;
    rider.speed = 170 / KMH;
    const spawned = pilotFrom(state, hazardFreeRoad, 6, (tick) => {
      if (tick === 0) {
        spawnRock(state, hazardFreeRoad, {
          command: "cmd-7",
          id: "drop",
          s: 1000,
          x: 1.8,
        });
      }
    });
    expect(spawned.line).toStrictEqual(scheduled.line);
  });

  it("crashing over a spawned rock names the rock and the command that dropped it", () => {
    const state = field(hazardFreeRoad, 1, 0, 0);
    spawnRock(state, hazardFreeRoad, {
      command: "cmd-8",
      id: "late-drop",
      s: 1000,
      x: 1.8,
    });
    const rider = player(state);
    rider.s = 960;
    rider.x = 1.8;
    rider.speed = 230 / KMH;
    const struck = hold(state, hazardFreeRoad, flatOut, 3).flatMap((event) =>
      event.kind === "crash" ? [event.hazard] : []
    );
    expect(struck).toStrictEqual([
      expect.objectContaining({
        command: "cmd-8",
        id: "late-drop",
        kind: "rock",
      }),
    ]);
  });

  it("a hazard cannot be spawned on a ramp, off the road, or with an id already taken", () => {
    const state = field(rampRoad, 1, 0, 0);
    const spot = { command: null, id: "a", s: 1500, x: 0 };
    expect(spawnPothole(state, rampRoad, spot)?.id).toBe("a");
    expect(spawnPothole(state, rampRoad, { ...spot, s: 1600 })).toBeUndefined();
    expect(
      spawnOil(state, rampRoad, { ...spot, id: "b", s: 1008 })
    ).toBeUndefined();
    expect(
      spawnRock(state, rampRoad, { ...spot, id: "c", x: 4.4 })
    ).toBeUndefined();
  });

  it("a cop chasing the player rides round a rock spawned in its path", () => {
    const state = field(hazardFreeRoad, 1, 0, 1);
    const cop = riderAt(state, 1);
    cop.parked = false;
    cop.s = 700;
    cop.x = 1.8;
    cop.speed = 40;
    const me = player(state);
    me.s = 720;
    me.x = -1.8;
    me.speed = 40;
    spawnRock(state, hazardFreeRoad, {
      command: "cmd-9",
      id: "cop-rock",
      s: 900,
      x: 1.8,
    });
    const inputs = state.riders.map(() => ({ ...neutralInput }));
    const events: RaceEvent[] = [];
    for (let tick = 0; tick < 10 * TICK_RATE; tick += 1) {
      for (const [index, input] of inputs.entries()) {
        if (index > 0) {
          pilotInput(state, hazardFreeRoad, index, input);
        }
      }
      inputs[0] = { ...neutralInput, throttle: 0.6 };
      stepRace(state, hazardFreeRoad, inputs);
      events.push(...state.events);
    }
    expect(cop.s).toBeGreaterThan(1000);
    expect(
      events.filter((event) => event.kind === "crash" && event.rider === 1)
    ).toStrictEqual([]);
  });

  it("the pilot never dodges a rock into the back of a slow truck", () => {
    expect(downed(pilotBehindTruck(hazardFreeRoad).events)).toStrictEqual([]);
    const withRock = pilotBehindTruck(
      roadWith(placedAt("rock", 1000, 0, "centre"))
    );
    expect(downed(withRock.events)).toStrictEqual([]);
  });

  it.each([
    ["pothole", "rut"],
    ["oil", "slick"],
  ] as const)(
    "the pilot escaping a slow truck never weakens the escape to miss a %s in the lane it escapes to",
    (kind, id) => {
      const nearTruck = { ...closingOnTruck, truckS: 960 };
      expect(
        downed(pilotBehindTruck(hazardFreeRoad, nearTruck).events)
      ).toStrictEqual([]);
      const run = pilotBehindTruck(
        roadWith(placedAt(kind, 970, -1.8, id)),
        nearTruck
      );
      expect(downed(run.events)).toStrictEqual([]);
    }
  );

  it("a rock on a climb throws the bike as high as one on the flat: it rides on at 130 km/h and goes down at 220 km/h", () => {
    const flat = rockOn(hazardFreeRoad, 130).highest;
    expect(flat).toBeGreaterThan(0.2);
    expect(
      Math.abs(rockOn(climbThenFlat, 130).highest - flat) / flat
    ).toBeLessThan(0.02);
    expect(rockOn(climbThenFlat, 130).crashes).toStrictEqual([]);
    expect(
      rockOn(climbThenFlat, 220).crashes.map((crash) => crash.hazard?.id)
    ).toStrictEqual(["boulder"]);
  });

  it("the pilot escaping a truck straightens short of a rock in its escape path once the line clears the truck", () => {
    const run = pilotBehindTruck(
      roadWith(placedAt("rock", 970, -0.6, "beside")),
      fastOnTruck
    );
    expect(effectsOf(run.events)).toStrictEqual([]);
    expect(downed(run.events)).toStrictEqual([]);
  });

  it("a pursuing cop escaping a truck straightens short of a rock in its escape path once the line clears the truck", () => {
    expect(
      downed(
        copBehindTruck(
          roadWith(placedAt("rock", 970, -0.6, "beside")),
          fastOnTruck
        )
      )
    ).toStrictEqual([]);
  });

  it.each(escapes)(
    "the pilot escaping a truck past %s stays up, as it does on a clear road",
    (_, closing, hazard) => {
      expect(
        downed(pilotBehindTruck(hazardFreeRoad, closing).events)
      ).toStrictEqual([]);
      expect(
        downed(pilotBehindTruck(roadWith(hazard), closing).events)
      ).toStrictEqual([]);
    }
  );

  it.each(escapes)(
    "a pursuing cop escaping a truck past %s stays up, as it does on a clear road",
    (_, closing, hazard) => {
      expect(downed(copBehindTruck(hazardFreeRoad, closing))).toStrictEqual([]);
      expect(downed(copBehindTruck(roadWith(hazard), closing))).toStrictEqual(
        []
      );
    }
  );

  it("a pursuing cop never dodges a rock into the back of a slow truck", () => {
    expect(downed(copBehindTruck(hazardFreeRoad))).toStrictEqual([]);
    expect(
      downed(copBehindTruck(roadWith(placedAt("rock", 1000, 0, "centre"))))
    ).toStrictEqual([]);
  });

  it("a rock lying in an oil slick still bumps the bike: every hazard touched acts", () => {
    const run = rideAt(
      roadWith(
        placedAt("oil", 999.9, 1.8, "slick"),
        placedAt("rock", 1000, 1.8, "boulder")
      ),
      { lateralSpeed: 0, s: 990, speed: 50, x: 1.8 },
      0,
      0,
      0.5
    );
    expect(effectsOf(run.events)).toStrictEqual(["slip", "bump"]);
  });

  it.each([5, 20])(
    "the pilot dodges a rock to the clear side, not into a second rock %i m beyond it",
    (apart) => {
      const run = pilotAt(
        roadWith(
          placedAt("rock", 1000, 1.8, "first"),
          placedAt("rock", 1000 + apart, 3.08, "second")
        ),
        800,
        6
      );
      expect(effectsOf(run.events)).toStrictEqual([]);
      expect(downed(run.events)).toStrictEqual([]);
    }
  );

  it("a bike already steering clear of a rock sideways does not touch it as it passes", () => {
    const run = rideAt(
      roadWith(placedAt("rock", 1000, 0, "boulder")),
      { lateralSpeed: 4, s: 998.1, speed: 54, x: 0.82 },
      0,
      1,
      0.3
    );
    expect(effectsOf(run.events)).toStrictEqual([]);
  });

  it("a bike landing just past a pothole it flew over does not drop into it", () => {
    const state = field(
      roadWith(placedAt("pothole", 996.6, 1.8, "hole")),
      1,
      0,
      0
    );
    const rider = player(state);
    rider.s = 998;
    rider.x = 1.8;
    rider.speed = 54;
    rider.airborne = true;
    rider.air = 0.1;
    rider.verticalSpeed = -8;
    stepRace(state, roadWith(placedAt("pothole", 996.6, 1.8, "hole")), [
      flatOut,
    ]);
    expect(state.events.map((event) => event.kind)).toStrictEqual(["land"]);
  });

  it("a pilot looking at a hazard leaves the dice for jumps and fights untouched", () => {
    expect(diceAfterPiloting(boulder)).toBe(diceAfterPiloting(hazardFreeRoad));
  });
});
