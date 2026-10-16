import { bikes } from "@racer/sim/bikes";
import type { BikeId } from "@racer/sim/bikes";
import { bikeAt, rivals, weaponAt } from "@racer/sim/cast";
import type { RivalId } from "@racer/sim/cast";
import { pilotInput } from "@racer/sim/pilot";
import { createRace, neutralInput, stepRace } from "@racer/sim/race";
import { MAX_STAMINA } from "@racer/sim/state";
import type { RaceState, RiderInput, RiderState } from "@racer/sim/state";
import { arm } from "@racer/sim/weapons";
import { roadAtLevel } from "@racer/track/road";
import { regionOf, roads as roadPlans, trackFor } from "@racer/track/roads";
import { compileTrack } from "@racer/track/track";
import { ridgeRoad } from "@racer/track/tracks/ridge-road";
import { describe, expect, it } from "vitest";

import { fieldFor, roadsFor, setupFor } from "./field.ts";
import type { CareerRaceSetup } from "./field.ts";
import { bustedLine, officerLines, preRaceLine, rivalLines } from "./lines.ts";
import { createRaceLog, outcomeOf, recordTick } from "./outcome.ts";
import type { RaceLog } from "./outcome.ts";
import { parseCareer, serialiseCareer } from "./save.ts";
import { seasonBoard } from "./season.ts";
import {
  billConsequence,
  quitRace,
  resumeCareer,
  settleRace,
  startRace,
} from "./settle.ts";
import type { Ledger, Settlement } from "./settle.ts";
import { buyBike, canBuy, sellBike, shopStock } from "./shop.ts";
import { newCareer, nextRaceSeed } from "./state.ts";
import type { CareerState } from "./state.ts";
import {
  acceptEnvelope,
  LEFT_RACE_NOTE,
  refuseEnvelope,
  storyBeat,
} from "./story.ts";
import { levels, policeLevels, roadList } from "./tables.ts";
import type { Level, RoadId } from "./tables.ts";

const TICKS = 60;
const TRUCE_SECONDS = 3;
const road = compileTrack({
  ...ridgeRoad,
  features: [],
  sections: [{ climb: 0, length: 9000, turnDegrees: 0 }],
  trafficPerKilometre: 0,
});

const flatOut: RiderInput = { ...neutralInput, throttle: 1 };

interface Entered {
  readonly career: CareerState;
  readonly setup: CareerRaceSetup;
  readonly state: RaceState;
  readonly log: RaceLog;
}

const enter = (career: CareerState, roadId: RoadId, seed = 7): Entered => {
  const start = startRace(career, roadId, seed);
  if (!start.started) {
    throw new Error(`The race did not start: ${start.reason}.`);
  }
  const setup = setupFor(start.career, roadId, seed, road);
  return {
    career: start.career,
    log: createRaceLog(setup),
    setup,
    state: createRace(setup),
  };
};

const riderOf = (race: Entered, racer: RivalId | "player"): RiderState => {
  const rider =
    race.state.riders[
      racer === "player" ? 0 : race.setup.field.indexOf(racer) + 1
    ];
  if (!rider) {
    throw new Error(`${racer} is not in this race.`);
  }
  return rider;
};

const ride = (
  race: Entered,
  seconds: number,
  inputsAt: (tick: number) => readonly RiderInput[]
): void => {
  for (let tick = 0; tick < seconds * TICKS && !race.log.outcome; tick += 1) {
    stepRace(race.state, road, inputsAt(tick));
    recordTick(race.log, race.state, race.setup);
  }
};

const settle = (race: Entered): Settlement =>
  settleRace(race.career, outcomeOf(race.state, race.setup, race.log));

const ledgerOf = (settlement: Settlement): Ledger => {
  if (!settlement.ledger) {
    throw new Error("The race did not settle.");
  }
  return settlement.ledger;
};

const sprint = (
  race: Entered,
  place: number,
  leaders: readonly RivalId[] = [],
  playerGap = 240
): void => {
  const order = [
    ...leaders,
    ...race.setup.field.filter((rival) => !leaders.includes(rival)),
  ];
  const inputs = race.state.riders.map(() => neutralInput);
  inputs[0] = flatOut;
  for (const [slot, rival] of order.entries()) {
    const rider = riderOf(race, rival);
    const ahead = slot < place - 1;
    rider.s = ahead ? road.length - 40 - slot * 12 : 100 + slot * 10;
    rider.speed = ahead ? 40 : 0;
    inputs[race.setup.field.indexOf(rival) + 1] = ahead
      ? flatOut
      : neutralInput;
  }
  const player = riderOf(race, "player");
  player.s = road.length - playerGap;
  player.speed = 40;
  ride(race, 30, () => inputs);
};

const crashOut = (race: Entered): void => {
  const player = riderOf(race, "player");
  player.s = 300;
  player.speed = 30;
  player.condition = 1;
  ride(race, 20, () => [{ ...flatOut, steer: 1, throttle: 0.5 }]);
};

const getArrested = (race: Entered, racer: RivalId | "player" = "player") => {
  const copIndex = race.setup.field.length + 1;
  const cop = race.state.riders[copIndex];
  const arrested = riderOf(race, racer);
  if (!cop) {
    throw new Error("The race has no cop.");
  }
  cop.parked = false;
  cop.s = 150;
  cop.x = road.plan.laneWidth / 2;
  cop.speed = 22;
  arrested.s = 200;
  arrested.speed = 15;
  const inputs = race.state.riders.map(() => ({ ...neutralInput }));
  ride(race, 1 / TICKS, () => inputs);
  arrested.stamina = 0;
  for (
    let tick = 0;
    tick < 30 * TICKS && arrested.mode !== "busted";
    tick += 1
  ) {
    const copInput = inputs[copIndex];
    if (copInput) {
      pilotInput(race.state, road, copIndex, copInput);
    }
    ride(race, 1 / TICKS, () => inputs);
  }
  cop.parked = true;
  cop.speed = 0;
  cop.s = road.length / 2;
  cop.x = road.roadHalfWidth + 1.1;
};

const idle: RiderInput = { ...neutralInput, throttle: 0.5 };

const knockDown = (race: Entered, rival: RivalId, times: number): void => {
  const me = riderOf(race, "player");
  const them = riderOf(race, rival);
  const themIndex = race.setup.field.indexOf(rival) + 1;
  for (const other of race.setup.field) {
    riderOf(race, other).s = other === rival ? 50 : 400 + themIndex;
  }
  me.s = 50;
  me.speed = 30;
  them.speed = 30;
  let downs = 0;
  let wasRiding = false;
  for (let tick = 0; tick < 60 * TICKS && downs < times; tick += 1) {
    const riding = them.mode === "riding";
    if (riding) {
      them.stamina = wasRiding ? them.stamina : 10;
      them.x = 1.8;
      them.s = me.s;
      me.x = 0.3;
    }
    downs += wasRiding && !riding ? 1 : 0;
    wasRiding = riding;
    const inputs = race.state.riders.map(() => neutralInput);
    inputs[0] = { ...idle, punch: riding && tick % 40 === 0 };
    const theirInput = { ...idle };
    if (!riding) {
      pilotInput(race.state, road, themIndex, theirInput);
    }
    inputs[themIndex] = theirInput;
    stepRace(race.state, road, inputs);
    recordTick(race.log, race.state, race.setup);
  }
};

const rivalIn = (setup: CareerRaceSetup, rival: RivalId) =>
  setup.rivals[setup.field.indexOf(rival)];

const takeWeaponFrom = (race: Entered, rival: RivalId): void => {
  const me = riderOf(race, "player");
  const them = riderOf(race, rival);
  const themIndex = race.setup.field.indexOf(rival) + 1;
  for (const other of race.setup.field) {
    riderOf(race, other).s = 400;
  }
  me.s = 50;
  me.speed = 30;
  them.speed = 30;
  for (let tick = 0; tick < TICKS; tick += 1) {
    me.x = 0.3;
    them.x = 1.8;
    them.s = me.s;
    const inputs = race.state.riders.map(() => neutralInput);
    inputs[0] = { ...idle, kick: tick === 0 };
    inputs[themIndex] = idle;
    stepRace(race.state, road, inputs);
    recordTick(race.log, race.state, race.setup);
  }
};

const photoFinishOver = (race: Entered, rival: RivalId): void => {
  const chaser = riderOf(race, rival);
  const me = riderOf(race, "player");
  const inputs = race.state.riders.map(() => neutralInput);
  inputs[0] = flatOut;
  inputs[race.setup.field.indexOf(rival) + 1] = flatOut;
  me.s = road.length - 60;
  me.x = 1.8;
  me.speed = 40;
  chaser.s = road.length - 72;
  chaser.x = -1.8;
  chaser.speed = 40;
  ride(race, 10, () => inputs);
};

const ATTACK_SEEDS = Array.from({ length: 40 }, (_, index) => index + 1);
const ATTACK_SECONDS = 60;

const attacksOnThePlayer = (
  career: CareerState,
  rival: RivalId,
  roadId: RoadId
): number => {
  let attacks = 0;
  for (const seed of ATTACK_SEEDS) {
    const setup = setupFor(career, roadId, seed, road);
    const state = createRace(setup);
    const index = setup.field.indexOf(rival) + 1;
    const inputs = state.riders.map(() => ({ ...neutralInput }));
    const input = inputs[index];
    const [me] = state.riders;
    const them = state.riders[index];
    if (!(input && me && them)) {
      throw new Error(`${rival} is not in the race with seed ${seed}.`);
    }
    for (const other of setup.field) {
      const rider = state.riders[setup.field.indexOf(other) + 1];
      if (rider) {
        rider.s = 400;
      }
    }
    for (
      let tick = 0;
      tick < (TRUCE_SECONDS + ATTACK_SECONDS) * TICKS;
      tick += 1
    ) {
      me.s = 50;
      me.x = 0.3;
      me.speed = 30;
      me.stamina = MAX_STAMINA;
      them.s = 50;
      them.x = 1.8;
      them.speed = 30;
      pilotInput(state, road, index, input);
      stepRace(state, road, inputs);
      attacks += state.events.filter(
        (event) => event.kind === "attack" && event.rider === index
      ).length;
    }
  }
  return attacks;
};

type Step =
  | { readonly roadId: RoadId; readonly place: number }
  | { readonly roadId: RoadId; readonly ends: "busted" | "wrecked" };

const play = (career: CareerState, step: Step, seed = 7): Settlement => {
  const race = enter(career, step.roadId, seed);
  if ("place" in step) {
    sprint(race, step.place);
  } else if (step.ends === "busted") {
    getArrested(race);
  } else {
    crashOut(race);
  }
  return settle(race);
};

const playAll = (career: CareerState, steps: readonly Step[]): CareerState => {
  let current = career;
  for (const [index, step] of steps.entries()) {
    current = play(current, step, index + 1).career;
  }
  return current;
};

const decentSeason: readonly Step[] = [
  { place: 3, roadId: "slag-row" },
  { place: 4, roadId: "breakwater-run" },
  { place: 3, roadId: "breakwater-run" },
  { ends: "busted", roadId: "hollow-pine-road" },
  { place: 3, roadId: "hollow-pine-road" },
  { ends: "wrecked", roadId: "cinder-wash" },
  { place: 2, roadId: "cinder-wash" },
  { place: 3, roadId: "ridge-road" },
];

const weakSeason: readonly Step[] = [
  { ends: "wrecked", roadId: "slag-row" },
  { ends: "wrecked", roadId: "slag-row" },
  ...roadList.flatMap((entry): Step[] => [
    { place: 7, roadId: entry.id },
    { place: 3, roadId: entry.id },
  ]),
];

interface Season {
  readonly level: Level;
  readonly start: CareerState;
  readonly end: CareerState;
}

const seasonsOf = (
  steps: readonly Step[],
  purchases: readonly BikeId[]
): readonly Season[] => {
  const seasons: Season[] = [];
  let career = newCareer(11);
  for (const level of levels) {
    const end = playAll(career, steps);
    seasons.push({ end, level, start: career });
    const next = purchases[level - 1];
    career = next ? buyBike(end, next) : end;
  }
  return seasons;
};

const decent = seasonsOf(decentSeason, [
  "halden-kite-500",
  "ostra-sesta-600",
  "ostra-sette-750",
  "halden-meridian-900",
]);

const weak = seasonsOf(weakSeason, [
  "halden-kite-500",
  "ostra-sesta-600",
  "ostra-sette-750",
]);

const seasonAt = (seasons: readonly Season[], level: Level): Season => {
  const season = seasons[level - 1];
  if (!season) {
    throw new Error(`No season at level ${level}.`);
  }
  return season;
};

const cashAt = (seasons: readonly Season[]) =>
  seasons.map((season) => [season.start.cash, season.end.cash]);

describe("the economy", () => {
  it("a decent level-1 season ends with the $4,900 of the worked example and moves up", () => {
    const { end } = seasonAt(decent, 1);
    expect({
      bike: end.bikeId,
      cash: end.cash,
      level: end.level,
      record: end.record,
    }).toStrictEqual({
      bike: "halden-wren-400",
      cash: 4900,
      level: 2,
      record: {
        busts: 1,
        earnings: 4200,
        knockdowns: 0,
        podiums: 5,
        starts: 8,
        wins: 0,
        wrecks: 1,
      },
    });
  });

  it("the decent player buys one bike per level and ends each level with the cash in the pacing table", () => {
    expect(cashAt(decent)).toStrictEqual([
      [1500, 4900],
      [1700, 6820],
      [1820, 8750],
      [2550, 12_230],
      [330, 12_250],
    ]);
    expect(decent.map((season) => season.start.bikeId)).toStrictEqual([
      "halden-wren-400",
      "halden-kite-500",
      "ostra-sesta-600",
      "ostra-sette-750",
      "halden-meridian-900",
    ]);
  });

  it("a weak level-1 season of five thirds, five sevenths, and two wrecks ends with $4,700", () => {
    const { end } = seasonAt(weak, 1);
    expect([end.cash, end.level, end.record.starts]).toStrictEqual([
      4700, 2, 12,
    ]);
  });

  it("the weak player still finishes the season, on the Sette, with the cash in the weak table", () => {
    expect(cashAt(weak)).toStrictEqual([
      [1500, 4700],
      [1500, 6500],
      [1500, 7800],
      [1600, 10_400],
      [10_400, 22_200],
    ]);
    const last = seasonAt(weak, 5);
    expect(canBuy(seasonAt(weak, 4).end, "halden-meridian-900")).toBeFalsy();
    expect([last.end.bikeId, last.end.story.ending]).toStrictEqual([
      "ostra-sette-750",
      "runner-up",
    ]);
  });

  it("two wrecks before the first prize put the weak player in debt inside the credit limit at levels 3 and 4", () => {
    const afterTwoWrecks = ([3, 4] as const).map((level) => {
      const career = playAll(
        seasonAt(weak, level).start,
        weakSeason.slice(0, 2)
      );
      return [career.cash, career.bikeId, career.gameOver];
    });
    expect(afterTwoWrecks).toStrictEqual([
      [-1800, "ostra-sesta-600", false],
      [-3200, "ostra-sette-750", false],
    ]);
  });

  it("a repeat run on a qualified road pays half for a top-three place", () => {
    const qualified = play(newCareer(1), { place: 3, roadId: "slag-row" });
    const repeat = ledgerOf(
      play(qualified.career, { place: 1, roadId: "slag-row" })
    );
    expect([
      ledgerOf(qualified).prize,
      repeat.prize,
      repeat.qualified,
    ]).toStrictEqual([700, 750, false]);
  });

  it("a place outside the top three on a qualified road pays nothing, and the same place on a new road pays in full", () => {
    const qualified = play(newCareer(1), {
      place: 2,
      roadId: "slag-row",
    }).career;
    const repeat = ledgerOf(play(qualified, { place: 5, roadId: "slag-row" }));
    const fresh = ledgerOf(
      play(qualified, { place: 5, roadId: "cinder-wash" })
    );
    expect([repeat.prize, repeat.cashAfter, fresh.prize]).toStrictEqual([
      0, 2500, 250,
    ]);
  });

  it("a bust is charged in full on a qualified road and a wreck costs the class of the bike ridden", () => {
    const qualified = play(newCareer(1), {
      place: 1,
      roadId: "slag-row",
    }).career;
    const bust = ledgerOf(
      play(qualified, { ends: "busted", roadId: "slag-row" })
    );
    const onSesta = buyBike({ ...qualified, cash: 9000 }, "ostra-sesta-600");
    const wreck = ledgerOf(
      play(onSesta, { ends: "wrecked", roadId: "slag-row" })
    );
    expect([bust.fine, bust.prize, wreck.repair]).toStrictEqual([400, 0, 600]);
  });
});

const wreckTimes = (career: CareerState, times: number): Settlement[] => {
  const settlements: Settlement[] = [];
  let current = career;
  for (let wreck = 0; wreck < times; wreck += 1) {
    const race = enter(current, "slag-row", wreck + 1);
    const settlement = quitRace(
      race.career,
      outcomeOf(race.state, race.setup, race.log)
    );
    settlements.push(settlement);
    current = settlement.career;
  }
  return settlements;
};

const lastOf = (settlements: readonly Settlement[]): Settlement => {
  const last = settlements.at(-1);
  if (!last) {
    throw new Error("Nothing was settled.");
  }
  return last;
};

describe("going broke", () => {
  it("three wrecks in debt take the Wren and leave the player on the Gutter Pup with the remainder", () => {
    const inDebt = lastOf(wreckTimes(newCareer(1), 4)).career;
    const wrecks = wreckTimes(inDebt, 3);
    expect(inDebt.cash).toBe(-100);
    expect(
      wrecks.map((settlement) => [
        settlement.career.cash,
        settlement.career.bikeId,
      ])
    ).toStrictEqual([
      [-500, "halden-wren-400"],
      [-900, "halden-wren-400"],
      [500, "gutter-pup-250"],
    ]);
    expect(ledgerOf(lastOf(wrecks))).toMatchObject({
      cashAfter: 500,
      gameOver: false,
      repair: 400,
      repossessed: { bikeId: "halden-wren-400", tradeIn: 1800 },
    });
    expect(lastOf(wrecks).career.board[0]).toStrictEqual({
      bikeId: "halden-wren-400",
      kind: "repossessed",
    });
  });

  it("owing more than $750 on the Gutter Pup ends the career and no more races start", () => {
    const onThePup = lastOf(wreckTimes(newCareer(1), 7)).career;
    const wrecks = wreckTimes(onThePup, 4);
    const over = lastOf(wrecks).career;
    expect(
      wrecks.map((settlement) => [
        settlement.career.cash,
        settlement.career.gameOver,
      ])
    ).toStrictEqual([
      [100, false],
      [-300, false],
      [-700, false],
      [-1100, true],
    ]);
    expect(startRace(over, "slag-row", 1)).toMatchObject({
      reason: "gameOver",
      started: false,
    });
    expect(canBuy(over, "gutter-pup-250")).toBeFalsy();
  });

  it("a Wren rider $800 in debt who wrecks at level 5 loses the bike and the career in one step", () => {
    const career: CareerState = { ...newCareer(1), cash: -800, level: 5 };
    const ledger = ledgerOf(lastOf(wreckTimes(career, 1)));
    expect(ledger).toMatchObject({
      cashAfter: -1200,
      gameOver: true,
      repair: 2200,
      repossessed: { bikeId: "halden-wren-400", tradeIn: 1800 },
    });
  });

  it("the garage does not sell to a player in debt, but the player can sell down to the Pup", () => {
    const inDebt = lastOf(wreckTimes(newCareer(1), 4)).career;
    const sold = sellBike(inDebt);
    expect(canBuy(inDebt, "gutter-pup-250")).toBeFalsy();
    expect(buyBike(inDebt, "gutter-pup-250")).toBe(inDebt);
    expect([sold.cash, sold.bikeId]).toStrictEqual([1700, "gutter-pup-250"]);
  });
});

describe("the rewarded ad", () => {
  it("halves a repair bill, which can be what keeps the bike", () => {
    const inDebt: CareerState = { ...newCareer(1), cash: -600 };
    const race = enter(inDebt, "slag-row");
    crashOut(race);
    const outcome = outcomeOf(race.state, race.setup, race.log);
    const full = ledgerOf(settleRace(race.career, outcome));
    const half = ledgerOf(settleRace(race.career, outcome, "half"));
    expect(outcome.result).toBe("wrecked");
    expect([
      full.repair,
      full.cashAfter,
      full.repossessed?.bikeId,
    ]).toStrictEqual([400, 800, "halden-wren-400"]);
    expect([
      half.repair,
      half.repairHalved,
      half.cashAfter,
      half.repossessed,
    ]).toStrictEqual([200, true, -800, null]);
  });

  it("is not offered for a quit, so the bill stays whole", () => {
    const start = startRace(newCareer(1), "slag-row", 1);
    const race = enter(newCareer(1), "slag-row", 1);
    const quit = outcomeOf(race.state, race.setup, race.log);
    expect(ledgerOf(settleRace(start.career, quit, "half"))).toMatchObject({
      repair: 400,
      repairHalved: false,
      result: "quit",
    });
  });

  it("the screens can tell before the bill lands whether it takes the bike or the career", () => {
    const fresh = newCareer(1);
    const onThePup = sellBike(fresh);
    expect([
      billConsequence(fresh, 2400),
      billConsequence(fresh, 2401),
      billConsequence(fresh, 4051),
      billConsequence(onThePup, 4050),
      billConsequence(onThePup, 4051),
    ]).toStrictEqual([
      "covered",
      "repossession",
      "gameOver",
      "covered",
      "gameOver",
    ]);
  });
});

const topPoints = (career: CareerState): number[] =>
  seasonBoard(career)
    .map((row) => row.points)
    .slice(0, 8);

describe("leaving a race", () => {
  it("a reload in the middle of a race settles it as a wreck once and only once", () => {
    const racing = enter(newCareer(3), "ridge-road").career;
    const saved = parseCareer(serialiseCareer(racing));
    if (!saved.ok) {
      throw new Error(`The save did not load: ${saved.error.field}.`);
    }
    const first = resumeCareer(saved.career);
    const reloaded = parseCareer(serialiseCareer(first.career));
    if (!reloaded.ok) {
      throw new Error(`The save did not load: ${reloaded.error.field}.`);
    }
    const second = resumeCareer(reloaded.career);
    expect(ledgerOf(first)).toMatchObject({
      cashAfter: 1100,
      prize: 0,
      repair: 400,
      result: "quit",
    });
    expect([
      first.career.activeRace,
      storyBeat(first.career).leftRaceNote,
      second.ledger,
      second.career.cash,
      second.career.record.wrecks,
    ]).toStrictEqual([null, LEFT_RACE_NOTE, null, 1100, 1]);
    expect(second.career.board).toStrictEqual([{ kind: "leftRace" }]);
  });

  it("a race that has settled cannot be settled again with the same result", () => {
    const race = enter(newCareer(3), "slag-row");
    sprint(race, 1);
    const outcome = outcomeOf(race.state, race.setup, race.log);
    const once = settleRace(race.career, outcome);
    const twice = settleRace(once.career, outcome);
    expect([once.career.cash, once.settled]).toStrictEqual([3000, true]);
    expect(twice).toStrictEqual({
      career: once.career,
      ledger: null,
      reason: "noActiveRace",
      settled: false,
    });
  });

  it("a result from an earlier race cannot settle a later one on the same road with the same seed", () => {
    const first = enter(newCareer(3), "slag-row", 7);
    sprint(first, 1);
    const won = outcomeOf(first.state, first.setup, first.log);
    const paid = settleRace(first.career, won);
    const second = enter(paid.career, "slag-row", 7);
    const replayed = settleRace(second.career, won);
    sprint(second, 1);
    const repeat = settle(second);
    expect([first.setup.seed, won.raceId]).toStrictEqual([
      second.setup.seed,
      1,
    ]);
    expect(replayed).toStrictEqual({
      career: second.career,
      ledger: null,
      reason: "wrongRace",
      settled: false,
    });
    expect([
      paid.career.cash,
      replayed.career.cash,
      replayed.career.activeRace?.raceId,
      repeat.career.cash,
    ]).toStrictEqual([3000, 3000, 2, 3750]);
  });

  it("quitting from the pause menu costs the repair bill and still scores the riders left racing", () => {
    const race = enter(newCareer(3), "slag-row");
    ride(race, 5, () => race.state.riders.map(() => flatOut));
    const outcome = outcomeOf(race.state, race.setup, race.log);
    const settled = quitRace(race.career, outcome);
    const board = seasonBoard(settled.career);
    expect([
      outcome.result,
      outcome.place,
      outcome.placings.length,
    ]).toStrictEqual(["quit", 15, 15]);
    expect(ledgerOf(settled)).toMatchObject({ cashAfter: 1100, repair: 400 });
    expect(board.map((row) => row.points).slice(0, 8)).toStrictEqual([
      15, 14, 13, 12, 11, 10, 9, 8,
    ]);
    expect(settled.career.season.player.points).toBe(0);
  });

  it("quitting after a fight still scores the season and the rival remembers the fight, and a reload remembers nothing", () => {
    const race = enter(newCareer(3), "slag-row");
    knockDown(race, "dee-santangelo", 1);
    ride(race, 2, () => race.state.riders.map(() => flatOut));
    const quit = quitRace(
      race.career,
      outcomeOf(race.state, race.setup, race.log)
    );
    const reloaded = resumeCareer(race.career);
    expect([ledgerOf(quit), ledgerOf(reloaded)]).toMatchObject([
      { cashAfter: 1100, prize: 0, repair: 400, result: "quit" },
      { cashAfter: 1100, prize: 0, repair: 400, result: "quit" },
    ]);
    expect([topPoints(quit.career), topPoints(reloaded.career)]).toStrictEqual([
      [15, 14, 13, 12, 11, 10, 9, 8],
      [0, 0, 0, 0, 0, 0, 0, 0],
    ]);
    expect([
      quit.career.memory["dee-santangelo"].knockedDownByPlayer,
      quit.career.record.knockdowns,
      quit.career.board[0]?.kind,
      reloaded.career.memory["dee-santangelo"].knockedDownByPlayer,
      reloaded.career.record.knockdowns,
      reloaded.career.board[0]?.kind,
    ]).toStrictEqual([1, 1, "wentDown", 0, 0, "leftRace"]);
    expect(
      preRaceLine(quit.career, setupFor(quit.career, "slag-row", 8, road))
    ).toStrictEqual({
      rival: "dee-santangelo",
      text: rivalLines["dee-santangelo"].grudgeTaunt,
    });
  });

  it("nothing that happens after the player finishes changes the result", () => {
    const race = enter(newCareer(3), "slag-row");
    sprint(race, 2);
    const settledAt = outcomeOf(race.state, race.setup, race.log);
    for (let tick = 0; tick < 20 * TICKS; tick += 1) {
      stepRace(
        race.state,
        road,
        race.state.riders.map(() => flatOut)
      );
      recordTick(race.log, race.state, race.setup);
    }
    expect(outcomeOf(race.state, race.setup, race.log)).toBe(settledAt);
    expect(settledAt.placings.map((placing) => placing.fate)).toStrictEqual([
      "finished",
      "finished",
      ...Array.from({ length: 13 }, () => "racing"),
    ]);
  });
});

describe("moving up", () => {
  it("the fifth qualification moves the player up and unlocks the level's bikes", () => {
    const four = playAll(
      newCareer(5),
      roadList.slice(0, 4).map((entry) => ({ place: 3, roadId: entry.id }))
    );
    const fifth = play(four, { place: 1, roadId: "ridge-road" });
    const lockedBefore = shopStock(four)
      .filter((row) => row.refusal === "locked")
      .map((row) => row.bikeId);
    const lockedAfter = shopStock(fifth.career)
      .filter((row) => row.refusal === "locked")
      .map((row) => row.bikeId);
    expect([four.level, roadsFor(four).qualifiedCount]).toStrictEqual([1, 4]);
    expect(ledgerOf(fifth)).toMatchObject({
      levelUp: {
        bikes: ["ostra-sette-750", "brack-stoker-800"],
        level: 2,
      },
      qualified: true,
      qualifiedCount: 5,
    });
    expect(lockedBefore).toContain("ostra-sette-750");
    expect(lockedAfter).toStrictEqual([
      "halden-meridian-900",
      "brack-anvil-1100",
      "ostra-nera-1000",
    ]);
    expect(roadsFor(fifth.career)).toMatchObject({
      level: 2,
      next: "breakwater-run",
      qualifiedCount: 0,
    });
  });

  it("the Long Ridge is closed until the other four level-5 roads are qualified, and a top three there ends the season", () => {
    const { start } = seasonAt(decent, 5);
    const three = playAll(
      start,
      roadList.slice(0, 3).map((entry) => ({ place: 3, roadId: entry.id }))
    );
    const four = play(three, { place: 3, roadId: "slag-row" }).career;
    const fourth = play(four, { place: 4, roadId: "ridge-road" });
    const won = play(fourth.career, { place: 1, roadId: "ridge-road" });
    expect([
      roadsFor(three).finaleOpen,
      three.story.finaleUnlocked,
    ]).toStrictEqual([false, false]);
    expect(startRace(three, "ridge-road", 1)).toMatchObject({
      reason: "roadClosed",
      started: false,
    });
    expect([
      roadsFor(four).finaleOpen,
      four.story.finaleUnlocked,
    ]).toStrictEqual([true, true]);
    expect([
      ledgerOf(fourth).ending,
      roadsFor(fourth.career).finaleOpen,
      ledgerOf(won).ending,
      won.career.level,
    ]).toStrictEqual([null, true, "clean-crown", 5]);
    expect(startRace(won.career, "slag-row", 1)).toMatchObject({
      reason: "seasonOver",
      started: false,
    });
  });
});

const atLevel = (level: Level): CareerState => ({
  ...newCareer(1),
  level,
});

const junoAggression = (roadId: RoadId): number | undefined => {
  const seed =
    Array.from({ length: 40 }, (_, index) => index + 1).find((candidate) =>
      fieldFor(roadId, 5, candidate).includes("juno-kade")
    ) ?? 0;
  const setup = setupFor(atLevel(5), roadId, seed, road);
  return setup.rivals[setup.field.indexOf("juno-kade")]?.aggression;
};

describe("the roads", () => {
  it("the career's road table agrees with the track package on every length, region, and name", () => {
    const career = roadList.flatMap((entry) =>
      levels.map((level) => [
        entry.id,
        entry.name,
        entry.region,
        entry.lengths[level],
      ])
    );
    const track = roadList.flatMap((entry) =>
      levels.map((level) => [
        entry.id,
        roadPlans[entry.id].plan.name,
        regionOf(entry.id),
        roadAtLevel(roadPlans[entry.id], level).sections.reduce(
          (total, section) => total + section.length,
          0
        ),
      ])
    );
    expect(career).toStrictEqual(track);
  });

  it("a whole pilot-ridden race on Slag Row settles into fifteen places and a ledger that adds up", () => {
    const course = trackFor("slag-row", 1);
    const start = startRace(newCareer(21), "slag-row", 21);
    const setup = setupFor(start.career, "slag-row", 21, course);
    const state = createRace(setup);
    const log = createRaceLog(setup);
    const inputs = state.riders.map(() => ({ ...neutralInput }));
    for (let tick = 0; tick < 400 * TICKS && !log.outcome; tick += 1) {
      for (const [index, input] of inputs.entries()) {
        pilotInput(state, course, index, input);
      }
      stepRace(state, course, inputs);
      recordTick(log, state, setup);
    }
    const outcome = outcomeOf(state, setup, log);
    const ledger = ledgerOf(settleRace(start.career, outcome));
    expect(log.outcome).toBe(outcome);
    expect(outcome.placings.map((placing) => placing.place)).toStrictEqual(
      Array.from({ length: 15 }, (_, index) => index + 1)
    );
    expect(
      new Set(outcome.placings.map((placing) => placing.racer))
    ).toStrictEqual(new Set(["player", ...setup.field]));
    expect(outcome.placings[outcome.place - 1]?.racer).toBe("player");
    expect(ledger.cashAfter).toBe(
      1500 + ledger.prize - ledger.repair - ledger.fine
    );
  });
});

describe("the field", () => {
  it("always has fourteen different rivals with the road's home riders among them", () => {
    const problems: string[] = [];
    for (const level of levels) {
      for (const entry of roadList) {
        for (let seed = 1; seed <= 40; seed += 1) {
          const field = fieldFor(entry.id, level, seed);
          const home = roadsFor(atLevel(level)).roads.find(
            (status) => status.road.id === entry.id
          )?.home;
          if (
            new Set(field).size !== 14 ||
            !home ||
            home.length < 3 ||
            !home.every((rival) => field.includes(rival))
          ) {
            problems.push(`${entry.id} level ${level} seed ${seed}`);
          }
        }
      }
    }
    expect(problems).toStrictEqual([]);
  });

  it("never draws Juno at level 1, where Ruth Ann stands in on Ridge Road, and always draws her on Ridge Road from level 2", () => {
    const seeds = Array.from({ length: 60 }, (_, seed) => seed + 1);
    const levelOne = roadList.flatMap((entry) =>
      seeds.flatMap((seed) => fieldFor(entry.id, 1, seed))
    );
    const ridge = (level: Level) =>
      seeds.map((seed) => fieldFor("ridge-road", level, seed));
    expect(levelOne).not.toContain("juno-kade");
    expect(
      ridge(1).every(
        (field) =>
          field.includes("ruth-ann-bixby") && field.includes("coach-dale-hutto")
      )
    ).toBeTruthy();
    expect(
      ([2, 5] as const).map((level) =>
        ridge(level).every((field) => field.includes("juno-kade"))
      )
    ).toStrictEqual([true, true]);
  });

  it("draws a different mix from a different seed and the same mix from the same seed", () => {
    const fields = new Set(
      Array.from({ length: 20 }, (_, seed) =>
        [...fieldFor("slag-row", 2, seed)].toSorted().join(",")
      )
    );
    expect(fields.size).toBeGreaterThan(5);
    expect(fieldFor("slag-row", 2, 9)).toStrictEqual(
      fieldFor("slag-row", 2, 9)
    );
  });

  it("puts every rival on their bike and weapon for the level, the level's police on the road, and the player last on the grid", () => {
    const setup = setupFor(atLevel(4), "hollow-pine-road", 3, road);
    const state = createRace(setup);
    const [player, ...others] = state.riders;
    expect(
      setup.rivals.map((rival) => [rival.name, rival.bike.id, rival.weapon])
    ).toStrictEqual(
      setup.field.map((rival) => [
        rivals[rival].name,
        bikeAt(rivals[rival], 4),
        weaponAt(rivals[rival], 4),
      ])
    );
    expect(setup.police).toMatchObject({
      beat: 1500,
      count: 4,
      fine: 2200,
      officer: { name: "Deputy Wendell Haverty" },
      sightRange: 50,
      topSpeed: 64,
    });
    expect(
      others.filter((rider) => rider.profile.role === "police")
    ).toHaveLength(policeLevels[4].count);
    expect(
      others
        .filter((rider) => rider.profile.role === "racer")
        .every((rider) => rider.s > (player?.s ?? 0))
    ).toBeTruthy();
    expect(player?.bike).toBe(bikes["halden-wren-400"]);
  });

  it("Juno rides the Long Ridge at an aggression of 0.9 and anywhere else at her own", () => {
    expect([
      junoAggression("ridge-road"),
      junoAggression("cinder-wash"),
    ]).toStrictEqual([0.9, 0.25]);
  });
});

const afterMooseIsBusted = (playerAhead: number) => {
  const race = enter(newCareer(2), "slag-row");
  riderOf(race, "player").s = 200 + playerAhead;
  getArrested(race, "moose-kowalczyk");
  sprint(race, 1);
  const { career } = settle(race);
  return {
    blamed: career.memory["moose-kowalczyk"].bustedNearPlayer,
    line: preRaceLine(career, setupFor(career, "slag-row", 8, road)),
    note: career.board.find((note) => note.kind === "busted"),
    unblamed: career.memory["moose-kowalczyk"].busted,
  };
};

describe("memory", () => {
  it("a rival the player knocked down twice holds a grudge next race and opens with the grudge taunt", () => {
    const race = enter(newCareer(2), "slag-row");
    knockDown(race, "dee-santangelo", 2);
    sprint(race, 1);
    const settled = settle(race);
    const next = setupFor(settled.career, "slag-row", 8, road);
    expect(settled.career.memory["dee-santangelo"]).toMatchObject({
      aggressionBonus: 0.2,
      grudge: true,
      knockedDownByPlayer: 1,
      sharedRace: 1,
    });
    expect(rivalIn(next, "dee-santangelo")).toMatchObject({
      aggressionBoost: 0.2,
      grudge: 0,
    });
    expect(preRaceLine(settled.career, next)).toStrictEqual({
      rival: "dee-santangelo",
      text: rivalLines["dee-santangelo"].grudgeTaunt,
    });
    expect([
      settled.career.record.knockdowns,
      settled.career.board[0],
    ]).toMatchObject([
      2,
      { kind: "wentDown", rival: "dee-santangelo", roadId: "slag-row" },
    ]);
  });

  it(
    "a rival knocked down once attacks the player more often next race, and one beaten cleanly attacks less often",
    { timeout: 30_000 },
    () => {
      const fresh = newCareer(2);
      const fought = enter(fresh, "breakwater-run");
      knockDown(fought, "tristan-lux", 1);
      sprint(fought, 1);
      const sore = settle(fought).career;
      const clean = enter(fresh, "breakwater-run");
      sprint(clean, 1);
      const respectful = settle(clean).career;
      const usual = attacksOnThePlayer(fresh, "tristan-lux", "breakwater-run");
      expect(usual).toBeGreaterThan(500);
      expect(
        attacksOnThePlayer(sore, "tristan-lux", "breakwater-run")
      ).toBeGreaterThan(usual);
      expect(
        attacksOnThePlayer(respectful, "tristan-lux", "breakwater-run")
      ).toBeLessThan(usual);
      expect([
        rivalIn(setupFor(sore, "breakwater-run", 8, road), "tristan-lux")
          ?.grudge,
        preRaceLine(sore, setupFor(sore, "breakwater-run", 8, road))?.text,
      ]).toStrictEqual([undefined, rivalLines["tristan-lux"].grudgeTaunt]);
    }
  );

  it("a rival the player beat cleanly cools off, however often, and one with no memory opens with the default taunt", () => {
    const fresh = newCareer(2);
    const first = setupFor(fresh, "slag-row", 7, road);
    const race = enter(fresh, "slag-row");
    sprint(race, 1);
    const { career } = settle(race);
    const again = enter(career, "slag-row");
    sprint(again, 1);
    const twice = settle(again).career;
    const speaker = preRaceLine(fresh, first);
    expect(speaker?.text).toBe(
      speaker ? rivalLines[speaker.rival].taunt : undefined
    );
    expect(
      race.setup.field.map((rival) => career.memory[rival].aggressionBonus)
    ).toStrictEqual(Array.from({ length: 14 }, () => -0.05));
    expect(
      again.setup.field.map((rival) => twice.memory[rival].aggressionBonus)
    ).toStrictEqual(Array.from({ length: 14 }, () => -0.05));
  });

  it("a win by a wheel is remembered and pinned to the board", () => {
    const race = enter(newCareer(2), "slag-row");
    photoFinishOver(race, "dee-santangelo");
    const settled = settle(race);
    expect(settled.career.memory["dee-santangelo"]).toMatchObject({
      aggressionBonus: 0.05,
      lostToPlayerByAWheel: 1,
    });
    expect(settled.career.board).toContainEqual({
      kind: "photoFinish",
      loser: "dee-santangelo",
      winner: "player",
    });
    expect(ledgerOf(settled).line).toStrictEqual({
      rival: "dee-santangelo",
      text: rivalLines["dee-santangelo"].youBeatThem,
    });
  });

  it("a stolen weapon is carried into the next race and its owner wants it back", () => {
    const race = enter(newCareer(2), "slag-row");
    takeWeaponFrom(race, "moose-kowalczyk");
    sprint(race, 1);
    const { career } = settle(race);
    const next = setupFor(career, "cinder-wash", 4, road);
    expect([career.weapon, career.weaponHits]).toStrictEqual(["club", 6]);
    expect([next.player.weapon, next.player.weaponHits]).toStrictEqual([
      "club",
      6,
    ]);
    expect(career.memory["moose-kowalczyk"]).toMatchObject({
      aggressionBonus: 0.15,
      grudge: true,
      weaponTakenByPlayer: 1,
    });
    expect(career.board[0]).toStrictEqual({
      kind: "weaponWanted",
      rival: "moose-kowalczyk",
      weapon: "club",
    });
  });

  it("a rival who punches the player into a car is put down for the knockdown, with the kilometre it happened at", () => {
    const race = enter(newCareer(2), "slag-row");
    const me = riderOf(race, "player");
    const dee = riderOf(race, "dee-santangelo");
    const deeIndex = race.setup.field.indexOf("dee-santangelo") + 1;
    const inputs = race.state.riders.map(() => neutralInput);
    inputs[0] = idle;
    let struck = false;
    for (let tick = 0; tick < TICKS && !struck; tick += 1) {
      me.s = 2000;
      me.x = 0.3;
      me.speed = 30;
      dee.s = 2000;
      dee.x = 1.8;
      dee.speed = 30;
      inputs[deeIndex] = { ...idle, punch: tick === 0 };
      stepRace(race.state, road, inputs);
      recordTick(race.log, race.state, race.setup);
      struck = race.state.events.some(
        (event) => event.kind === "hit" && event.target === 0
      );
    }
    race.state.cars.push({
      cruiseSpeed: 0,
      halfLength: 2.2,
      halfWidth: 0.92,
      height: 1.45,
      paint: 0,
      s: me.s + 6,
      speed: 0,
      x: me.x,
    });
    const crashes: string[] = [];
    for (let tick = 0; tick < TICKS; tick += 1) {
      stepRace(race.state, road, inputs);
      recordTick(race.log, race.state, race.setup);
      crashes.push(
        ...race.state.events.flatMap((event) =>
          event.kind === "crash" && event.rider === 0 ? [event.cause] : []
        )
      );
    }
    const outcome = outcomeOf(race.state, race.setup, race.log);
    const { career } = quitRace(race.career, outcome);
    const incidents = outcome.incidents.find(
      (incident) => incident.rival === "dee-santangelo"
    );
    expect(crashes).toStrictEqual(["traffic"]);
    expect(incidents?.knockedPlayerDown).toBe(1);
    expect(incidents?.knockedPlayerDownKm).toBeCloseTo(2, 1);
    expect(career.memory["dee-santangelo"]).toMatchObject({
      aggressionBonus: -0.05,
      knockedPlayerDown: 1,
    });
    expect(career.board[0]).toStrictEqual({
      kind: "knockedPlayerDown",
      km: incidents?.knockedPlayerDownKm,
      rival: "dee-santangelo",
      roadId: "slag-row",
    });
  });

  it("a rival who crosses the line within half a second ahead won by a wheel, and one further ahead did not", () => {
    const race = enter(newCareer(2), "slag-row");
    const [clear, close] = race.setup.field;
    if (!(clear && close)) {
      throw new Error("The field is short.");
    }
    const inputs = race.state.riders.map(() => neutralInput);
    inputs[0] = flatOut;
    inputs[1] = flatOut;
    inputs[2] = flatOut;
    const placed = [
      [riderOf(race, clear), 10],
      [riderOf(race, close), 70],
      [riderOf(race, "player"), 82],
    ] as const;
    for (const [rider, short] of placed) {
      rider.s = road.length - short;
      rider.speed = 40;
    }
    ride(race, 10, () => inputs);
    const outcome = outcomeOf(race.state, race.setup, race.log);
    const { career } = settle(race);
    const finishOf = (racer: RivalId | "player") =>
      outcome.placings.find((placing) => placing.racer === racer)?.finishTick ??
      0;
    expect(outcome.place).toBe(3);
    expect(finishOf("player") - finishOf(close)).toBeLessThanOrEqual(30);
    expect(finishOf("player") - finishOf(clear)).toBeGreaterThan(30);
    expect([
      career.memory[close].beatPlayerByAWheel,
      career.memory[clear].beatPlayerByAWheel,
    ]).toStrictEqual([1, 0]);
    expect(career.board).toStrictEqual([
      { kind: "photoFinish", loser: "player", winner: close },
    ]);
  });

  it("a rival busted within 100 m of the player blames them, and one busted further off does not", () => {
    const note = {
      fine: 400,
      kind: "busted",
      rival: "moose-kowalczyk",
      roadId: "slag-row",
    };
    expect(afterMooseIsBusted(90)).toStrictEqual({
      blamed: 1,
      line: {
        rival: "moose-kowalczyk",
        text: rivalLines["moose-kowalczyk"].grudgeTaunt,
      },
      note,
      unblamed: 0,
    });
    expect(afterMooseIsBusted(135)).toStrictEqual({
      blamed: 0,
      line: {
        rival: "moose-kowalczyk",
        text: rivalLines["moose-kowalczyk"].taunt,
      },
      note,
      unblamed: 1,
    });
  });

  it("the board keeps the three newest notes with the newest first", () => {
    const left = resumeCareer(enter(newCareer(2), "slag-row").career).career;
    const race = enter(left, "slag-row");
    const third = race.setup.field.find(
      (rival) => rival !== "moose-kowalczyk" && rival !== "dee-santangelo"
    );
    if (!third) {
      throw new Error("The field is short.");
    }
    takeWeaponFrom(race, "moose-kowalczyk");
    knockDown(race, "dee-santangelo", 1);
    photoFinishOver(race, third);
    const { career } = settle(race);
    expect(left.board).toStrictEqual([{ kind: "leftRace" }]);
    expect(career.board).toMatchObject([
      { kind: "photoFinish", loser: third, winner: "player" },
      { kind: "wentDown", rival: "dee-santangelo" },
      { kind: "weaponWanted", rival: "moose-kowalczyk" },
    ]);
    expect(career.board).toHaveLength(3);
  });
});

describe("a bust", () => {
  it("records the fine, the officer, where it happened, and the weapon held when the rider was thrown", () => {
    const race = enter(newCareer(2), "hollow-pine-road");
    arm(riderOf(race, "player"), "chain");
    getArrested(race);
    const outcome = outcomeOf(race.state, race.setup, race.log);
    const settled = settleRace(race.career, outcome);
    expect(outcome).toMatchObject({
      arrest: {
        fine: 400,
        km: expect.closeTo(0.2, 1),
        officer: "wendell-haverty",
        weapon: "chain",
      },
      place: 15,
      result: "busted",
    });
    expect(settled.career.lastResult?.summary.bust).toStrictEqual({
      fine: 400,
      km: outcome.arrest?.km,
      line: bustedLine("wendell-haverty", race.setup.seed),
      officer: "wendell-haverty",
      officerName: "Deputy Wendell Haverty",
      weapon: "chain",
    });
    expect(ledgerOf(settled)).toMatchObject({
      cashAfter: 1100,
      fine: 400,
      prize: 0,
      qualified: false,
    });
    expect([settled.career.weapon, settled.career.record.busts]).toStrictEqual([
      "none",
      1,
    ]);
    expect(officerLines["wendell-haverty"]).toContain(
      bustedLine("wendell-haverty", race.setup.seed)
    );
  });

  it("the ticket names the spot on the road where the rider lay, not the verge they were moved to", () => {
    const race = enter(newCareer(2), "hollow-pine-road");
    const player = riderOf(race, "player");
    let lay = { s: player.bodyS, x: player.bodyX };
    const copIndex = race.setup.field.length + 1;
    const cop = race.state.riders[copIndex];
    const inputs = race.state.riders.map(() => ({ ...neutralInput }));
    const copInput = inputs[copIndex];
    if (!(cop && copInput)) {
      throw new Error("The race has no cop.");
    }
    cop.parked = false;
    cop.s = 150;
    cop.x = road.plan.laneWidth / 2;
    cop.speed = 22;
    player.s = 200;
    player.speed = 15;
    player.stamina = 0;
    for (let tick = 0; tick < 30 * TICKS && !race.log.outcome; tick += 1) {
      lay = { s: player.bodyS, x: player.bodyX };
      pilotInput(race.state, road, copIndex, copInput);
      stepRace(race.state, road, inputs);
      recordTick(race.log, race.state, race.setup);
    }
    const { arrest, km } = outcomeOf(race.state, race.setup, race.log);
    expect(Math.abs((arrest?.km ?? 0) * 1000 - lay.s)).toBeLessThan(0.2);
    expect(Math.abs((arrest?.x ?? 9) - lay.x)).toBeLessThan(0.2);
    expect(km).toBe(arrest?.km);
    expect([
      Math.abs(arrest?.x ?? 9) < road.roadHalfWidth,
      Math.abs(player.bodyX) > road.roadHalfWidth,
    ]).toStrictEqual([true, true]);
  });
});

describe("the story", () => {
  const levelTwo = seasonAt(decent, 1).end;

  it("offers the envelope at level 2, pays $1,500 for taking it, and takes back $2,000 when the player beats Tristan on Breakwater Run", () => {
    const taken = acceptEnvelope(levelTwo);
    const race = enter(taken, "breakwater-run");
    sprint(race, 4, ["tristan-lux"]);
    const behind = settle(race);
    const ahead = play(behind.career, { place: 1, roadId: "breakwater-run" });
    const again = play(ahead.career, { place: 1, roadId: "breakwater-run" });
    expect([
      storyBeat(seasonAt(decent, 1).start).envelopeOpen,
      storyBeat(levelTwo).envelopeOpen,
      taken.cash - levelTwo.cash,
      storyBeat(taken).envelopeOpen,
    ]).toStrictEqual([false, true, 1500, false]);
    expect([
      ledgerOf(behind).envelope,
      ledgerOf(ahead).envelope,
      ledgerOf(ahead).prize,
      ledgerOf(again).envelope,
    ]).toStrictEqual([0, -2000, 2400, 0]);
  });

  it("an envelope that is refused, or left on the board until the Breakwater race, pays nothing and cannot be taken later", () => {
    const refused = refuseEnvelope(levelTwo);
    const left = play(levelTwo, { place: 1, roadId: "breakwater-run" });
    expect([
      acceptEnvelope(refused).cash,
      left.career.story.envelope,
      acceptEnvelope(left.career).cash - left.career.cash,
      ledgerOf(left).envelope,
    ]).toStrictEqual([levelTwo.cash, "refused", 0, 0]);
  });

  it("Dee rides as an ally from level 3 until the player knocks her down twice in one race", () => {
    const levelThree = seasonAt(decent, 3).start;
    const race = enter(levelThree, "slag-row");
    knockDown(race, "dee-santangelo", 2);
    sprint(race, 1);
    const { career } = settle(race);
    expect([
      seasonAt(decent, 2).start.story.deeAlly,
      storyBeat(levelThree).deeAlly,
      career.story.deeAlly,
    ]).toStrictEqual([false, true, false]);
    expect(rivalIn(race.setup, "dee-santangelo")).toMatchObject({
      aggressionBoost: -1,
      grudge: 0,
    });
    expect(
      rivalIn(setupFor(career, "slag-row", 3, road), "dee-santangelo")
    ).toMatchObject({ aggressionBoost: 0.2, grudge: 0 });
  });

  it("winning the Long Ridge after taking the envelope is the bought crown", () => {
    const beforeFinale = playAll(
      seasonAt(decent, 5).start,
      roadList.slice(0, 4).map((entry) => ({ place: 3, roadId: entry.id }))
    );
    const bought: CareerState = {
      ...beforeFinale,
      story: { ...beforeFinale.story, envelope: "taken" },
    };
    const won = play(bought, { place: 1, roadId: "ridge-road" });
    const second = play(beforeFinale, { place: 2, roadId: "ridge-road" });
    expect([
      ledgerOf(won).ending,
      storyBeat(won.career).endingChapter?.name,
      ledgerOf(second).ending,
    ]).toStrictEqual(["bought-crown", "Bought Crown", "runner-up"]);
  });
});

describe("the season board", () => {
  it("ranks by points, then wins, then whoever most recently placed better", () => {
    const first = enter(newCareer(4), "slag-row", 1);
    sprint(first, 3, ["moose-kowalczyk", "dee-santangelo"]);
    const second = enter(settle(first).career, "slag-row", 2);
    sprint(second, 3, ["dee-santangelo", "moose-kowalczyk"]);
    const board = seasonBoard(settle(second).career);
    expect(board.slice(0, 3)).toStrictEqual([
      { points: 29, racer: "dee-santangelo", rank: 1, wins: 1 },
      { points: 29, racer: "moose-kowalczyk", rank: 2, wins: 1 },
      { points: 26, racer: "player", rank: 3, wins: 0 },
    ]);
  });
});

describe("race seeds", () => {
  it("each start draws the next seed from the career's own, the same way every time", () => {
    const career = newCareer(99);
    const afterOne = lastOf(wreckTimes(career, 1)).career;
    expect([
      nextRaceSeed(career) === nextRaceSeed(newCareer(99)),
      nextRaceSeed(career) === nextRaceSeed(afterOne),
      nextRaceSeed(career) === nextRaceSeed(newCareer(100)),
    ]).toStrictEqual([true, false, false]);
  });
});

type Json = null | boolean | number | string | Json[] | JsonRecord;

interface JsonRecord {
  readonly [key: string]: Json;
}

const isJsonRecord = (value: Json): value is JsonRecord =>
  Object(value) === value && !Array.isArray(value);

const withField = (node: Json, path: readonly string[], value: Json): Json => {
  const [key, ...rest] = path;
  if (key === undefined) {
    return value;
  }
  if (Array.isArray(node)) {
    return node.map((item, index) =>
      String(index) === key ? withField(item, rest, value) : item
    );
  }
  if (!isJsonRecord(node)) {
    throw new Error(`The save has nothing at ${key}.`);
  }
  return { ...node, [key]: withField(node[key] ?? null, rest, value) };
};

const corrupted = (career: CareerState, path: string, value: Json): string => {
  const save: Json = JSON.parse(serialiseCareer(career));
  return JSON.stringify(withField(save, path.split("."), value));
};

const verdictOn = (save: string): string => {
  const result = parseCareer(save);
  return result.ok ? "loaded" : `${result.error.kind}:${result.error.field}`;
};

const loaded = (career: CareerState): CareerState => {
  const save = parseCareer(serialiseCareer(career));
  if (!save.ok) {
    throw new Error(`The save did not load: ${save.error.field}.`);
  }
  return save.career;
};

describe("the save", () => {
  it("a career round-trips through its save text", () => {
    const careers = [
      newCareer(1),
      seasonAt(decent, 5).end,
      seasonAt(weak, 3).start,
      enter(seasonAt(decent, 2).start, "cinder-wash").career,
      play(newCareer(2), { ends: "busted", roadId: "slag-row" }).career,
      play(newCareer(2), { ends: "wrecked", roadId: "slag-row" }).career,
    ];
    expect(
      careers.map((career) => parseCareer(serialiseCareer(career)))
    ).toStrictEqual(careers.map((career) => ({ career, ok: true })));
  });

  it("text that is not a save, or a save from another version, is rejected with the reason", () => {
    const good = seasonAt(decent, 2).end;
    expect([
      verdictOn(serialiseCareer(good).slice(0, -40)),
      verdictOn("[]"),
      verdictOn('"a save"'),
      verdictOn(corrupted(good, "version", 1)),
    ]).toStrictEqual([
      "notJson:",
      "notJson:",
      "notJson:",
      "wrongVersion:version",
    ]);
  });

  it("a save with a value of the wrong kind or out of range is rejected with the field", () => {
    const good = seasonAt(decent, 2).end;
    const cases: readonly (readonly [string, Json])[] = [
      ["level", 9],
      ["cash", "lots"],
      ["bikeId", "rocket"],
      ["weaponHits", 4],
      ["gameOver", 0],
      ["garage.0", "rocket"],
      ["record.starts", -1],
      ["story.envelope", "burned"],
      ["memory.juno-kade.aggressionBonus", 2],
      ["board.0.kind", "graffiti"],
      ["lastResult.ledger.cashAfter", "lots"],
      ["lastResult.ledger.result", "won"],
      ["lastResult.summary.rows.0.name", 7],
      ["lastResult.summary.rows.0.fate", "vanished"],
      ["lastResult.summary", null],
    ];
    expect(
      cases.map(([path, value]) => verdictOn(corrupted(good, path, value)))
    ).toStrictEqual([
      "invalid:level",
      "invalid:cash",
      "invalid:bikeId",
      "invalid:weaponHits",
      "invalid:gameOver",
      "invalid:garage.0",
      "invalid:record.starts",
      "invalid:story.envelope",
      "invalid:memory.juno-kade.aggressionBonus",
      "invalid:board.0",
      "invalid:lastResult.ledger.cashAfter",
      "invalid:lastResult.ledger.result",
      "invalid:lastResult.summary.rows.0.name",
      "invalid:lastResult.summary.rows.0.fate",
      "invalid:lastResult.summary",
    ]);
  });

  it("an object that cannot be read as text, in place of any field, is an error value and never a throw", () => {
    const good = seasonAt(decent, 2).end;
    const poison: Json = { toString: 1, valueOf: 1 };
    const fields = Object.keys(good).filter((field) => field !== "version");
    const verdicts = fields.map((field) =>
      verdictOn(corrupted(good, field, poison))
    );
    expect(verdictOn(corrupted(good, "version", poison))).toBe(
      "wrongVersion:version"
    );
    expect(
      verdicts.map((verdict, index) =>
        verdict.startsWith(`invalid:${fields[index]}`)
      )
    ).toStrictEqual(fields.map(() => true));
    expect(verdictOn(JSON.stringify(poison))).toBe("wrongVersion:version");
  });

  it("a road or a racer the game does not have is rejected by name instead of being dropped", () => {
    const good = seasonAt(decent, 2).end;
    expect([
      verdictOn(corrupted(good, "qualified.1.moon-road", 1)),
      verdictOn(corrupted(good, "season.player.lastAhead.nobody", 1)),
    ]).toStrictEqual([
      "invalid:qualified.1.moon-road",
      "invalid:season.player.lastAhead.nobody",
    ]);
  });

  it("a save that contradicts itself is rejected with the field that does not fit", () => {
    const racing = enter(seasonAt(decent, 2).start, "cinder-wash").career;
    const settled = seasonAt(decent, 2).end;
    const { starts } = settled.record;
    expect([
      verdictOn(corrupted(racing, "activeRace.bikeId", "ostra-nera-1000")),
      verdictOn(corrupted(racing, "gameOver", true)),
      verdictOn(corrupted(racing, "activeRace.raceId", 1)),
      verdictOn(corrupted(racing, "activeRace.level", 1)),
      verdictOn(
        corrupted(settled, "activeRace", {
          bikeId: settled.bikeId,
          level: settled.level,
          raceId: starts,
          roadId: "slag-row",
          seed: 1,
          started: true,
        })
      ),
      verdictOn(
        corrupted(settled, "season.player.lastAhead.juno-kade", starts + 1)
      ),
      verdictOn(corrupted(settled, "lastResult.summary.raceId", starts + 1)),
      verdictOn(corrupted(settled, "memory.juno-kade.sharedRace", starts + 1)),
      verdictOn(corrupted(settled, "bikeId", "ostra-nera-1000")),
    ]).toStrictEqual([
      "inconsistent:activeRace.bikeId",
      "inconsistent:gameOver",
      "inconsistent:activeRace.raceId",
      "inconsistent:activeRace.level",
      "inconsistent:lastResult",
      "inconsistent:season.player.lastAhead.juno-kade",
      "inconsistent:lastResult.summary.raceId",
      "inconsistent:memory.juno-kade",
      "inconsistent:garage",
    ]);
  });
});

describe("the last result", () => {
  it("a refresh during the finish animation still has every number Results shows", () => {
    const race = enter(newCareer(3), "slag-row");
    sprint(race, 2);
    const settled = settle(race);
    const stored = loaded(settled.career).lastResult;
    const [winner, ...others] = race.setup.field;
    if (!(stored && winner)) {
      throw new Error("The save holds no result.");
    }
    const [first, second, third] = stored.summary.rows;
    expect(stored.ledger).toStrictEqual(ledgerOf(settled));
    expect(stored.ledger).toMatchObject({
      cashAfter: 2500,
      cashBefore: 1500,
      fine: 0,
      gameOver: false,
      levelUp: null,
      line: { rival: winner, text: rivalLines[winner].beatYou },
      place: 2,
      prize: 1000,
      qualified: true,
      repair: 0,
      repeat: false,
      repossessed: null,
    });
    expect(stored.summary).toMatchObject({
      bust: null,
      rows: [
        {
          bikeId: bikeAt(rivals[winner], 1),
          fate: "finished",
          name: rivals[winner].name,
          place: 1,
          prize: 1500,
          racer: winner,
        },
        {
          bikeId: "halden-wren-400",
          fate: "finished",
          name: "You",
          place: 2,
          prize: 1000,
          racer: "player",
        },
        ...others.toReversed().map((rival, index) => ({
          fate: "racing",
          finishTick: -1,
          name: rivals[rival].name,
          place: index + 3,
          prize: [700, 400, 250, 150, 100, 50, 40, 30, 25, 20, 15, 10, 10][
            index
          ],
          racer: rival,
        })),
      ],
      wreck: null,
    });
    expect([
      (first?.finishTick ?? 0) > 0,
      (second?.finishTick ?? 0) > (first?.finishTick ?? 0),
      (third?.metresLeft ?? 0) > 8000,
    ]).toStrictEqual([true, true, true]);
  });

  it("holds the wreck, the level-up, and the repossession, and is cleared when the next race starts", () => {
    const race = enter(newCareer(2), "slag-row");
    crashOut(race);
    const { km } = outcomeOf(race.state, race.setup, race.log);
    const wrecked = settle(race);
    const four = playAll(
      newCareer(5),
      roadList.slice(0, 4).map((entry) => ({ place: 3, roadId: entry.id }))
    );
    const promoted = play(four, { place: 1, roadId: "ridge-road" });
    const broke = lastOf(
      wreckTimes(lastOf(wreckTimes(newCareer(1), 4)).career, 3)
    );
    const next = startRace(promoted.career, "slag-row", 3);
    expect(km).toBeGreaterThan(0.3);
    expect(loaded(wrecked.career).lastResult).toMatchObject({
      ledger: { repair: 400, result: "wrecked" },
      summary: { wreck: { bikeId: "halden-wren-400", km } },
    });
    expect(loaded(promoted.career).lastResult?.ledger.levelUp).toStrictEqual({
      bikes: ["ostra-sette-750", "brack-stoker-800"],
      level: 2,
    });
    expect(loaded(broke.career).lastResult?.ledger).toMatchObject({
      cashAfter: 500,
      repossessed: { bikeId: "halden-wren-400", tradeIn: 1800 },
    });
    expect([
      promoted.career.lastResult?.summary.raceId,
      next.career.lastResult,
      next.career.activeRace?.raceId,
    ]).toStrictEqual([5, null, 6]);
  });

  it("carries the incidents Results prints under a rival's row", () => {
    const race = enter(newCareer(2), "slag-row");
    takeWeaponFrom(race, "moose-kowalczyk");
    knockDown(race, "dee-santangelo", 1);
    sprint(race, 1);
    const incidents = loaded(settle(race).career).lastResult?.summary.incidents;
    const about = (rival: RivalId) =>
      incidents?.find((incident) => incident.rival === rival);
    expect(about("moose-kowalczyk")).toMatchObject({
      knockedDownByPlayer: 0,
      weaponTakenByPlayer: "club",
    });
    expect(about("dee-santangelo")).toMatchObject({
      knockedDownByPlayer: 1,
      weaponTakenByPlayer: "none",
    });
    expect(about("dee-santangelo")?.knockdownTick).toBeGreaterThan(
      about("moose-kowalczyk")?.weaponTakenTick ?? 0
    );
    expect(about("dee-santangelo")?.knockdownKm).toBeGreaterThan(0.05);
  });
});
