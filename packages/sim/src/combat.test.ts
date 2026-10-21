import { compileTrack } from "@racer/track/track";
import { ridgeRoad } from "@racer/track/tracks/ridge-road";
import { describe, expect, it } from "vitest";

import { pilotInput } from "./pilot.ts";
import {
  brawl,
  cruising,
  field,
  pressing,
  riderAt,
  sideBySide,
  straight,
  track,
} from "./race-fixtures.ts";
import { createRace, defaultSetup, standings, stepRace } from "./race.ts";
import { FULL_CONDITION, MAX_STAMINA, TICK_RATE } from "./state.ts";
import type { RaceEvent, RaceState, RiderState } from "./state.ts";
import { disarm } from "./weapons.ts";

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
      hazardsPerKilometre: 0,
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

  it(
    "six riders of the new cast each finish Ridge Road, wreck, or are busted by the cop on patrol and the standings are ordered",
    { timeout: 30_000 },
    () => {
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
    }
  );

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
