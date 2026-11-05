import { recordedRules } from "@racer/career/bench";
import { abandonedOutcome, createRaceLog } from "@racer/career/outcome";
import type { RaceOutcome, RaceResult } from "@racer/career/outcome";
import type { RoomRun } from "@racer/rooms/room-run";
import { createRaceRun } from "@racer/sim/race-run";
import { PLAYER_RIDER } from "@racer/sim/state";
import { describe, expect, it } from "vitest";

import { firstQuickPick, planFor, quickEntry } from "../src/career/flow.ts";
import { undressed } from "../src/game/figure-wardrobe.ts";
import {
  attractAfter,
  attractOn,
  builtFrom,
  countDown,
  countdownFor,
  dressingFor,
  heldFrom,
  hudCountdown,
  liveRaceOf,
  pausedFrom,
  preparationFor,
  raceOf,
  racingFrom,
  releasedFrom,
  resumedFrom,
  roomOf,
  settledFrom,
  spendConsequence,
  spendResumeHold,
  stoodDownFrom,
  throttleOpen,
  ticksHalted,
  unprepared,
} from "../src/game/game-session.ts";
import type { Session } from "../src/game/game-session.ts";
import type { RacePlan } from "../src/game/hud.ts";
import type { PrepareOutcome } from "../src/prepare-outcome.ts";

const SEED = 31;
const COUNTDOWN_TICKS = 181;
const TICKS_TO_THE_LAST_DIGIT = 121;
const BUSTED_TICKS = 48;
const WRECKED_TICKS = 72;
const MOST_TICKS = 1000;
const preparing: Promise<PrepareOutcome> = Promise.resolve({ kind: "ready" });

const soloPlan: RacePlan = planFor(
  recordedRules,
  null,
  quickEntry(firstQuickPick, SEED)
);

const roomPlan = (countdownSeconds: () => number = () => 3): RacePlan => {
  const { step, view } = createRaceRun(soloPlan.setup);
  const room: RoomRun = {
    confirmed: view,
    countdownSeconds,
    events: () => [],
    frameDrawn: () => {
      throw new Error("The session never draws.");
    },
    lagging: () => false,
    leave: () => {
      throw new Error("The session never leaves a room.");
    },
    listen: () => {
      throw new Error("The session never listens.");
    },
    me: PLAYER_RIDER,
    report: () => {
      throw new Error("The session never reports.");
    },
    riderColours: new Map(),
    step,
    stepsDue: () => 1,
    view,
  };
  return { ...soloPlan, room };
};

const outcomeWith = (result: RaceResult): RaceOutcome => ({
  ...abandonedOutcome(recordedRules, {
    bikeId: firstQuickPick.bikeId,
    raceId: soloPlan.setup.raceId,
    roadId: soloPlan.setup.roadId,
    seed: SEED,
    started: true,
    tier: soloPlan.setup.tier,
  }),
  place: 7,
  result,
});

const counting = (plan = soloPlan) =>
  countdownFor(plan, createRaceLog(plan.setup), undressed);

const racing = (plan = soloPlan) => racingFrom(counting(plan));

const walk = (spend: () => boolean, digit: () => number) => {
  const digits = [digit()];
  let ticks = 0;
  let done = false;
  while (!done && ticks < MOST_TICKS) {
    done = spend();
    ticks += 1;
    if (digit() !== digits.at(-1)) {
      digits.push(digit());
    }
  }
  return { digits, ticks };
};

const ticksOf = (spend: () => boolean): number => walk(spend, () => 0).ticks;

const spendTicks = (state: Session, ticks: number): void => {
  for (let tick = 0; tick < ticks; tick += 1) {
    spendResumeHold(state);
  }
};

describe("attract", () => {
  it("rides its road with the clock running and no race", () => {
    const state = attractOn(2);
    expect({
      halted: ticksHalted(state),
      hud: hudCountdown(state),
      race: raceOf(state),
      roadTurn: state.roadTurn,
      seed: state.seed,
      throttle: throttleOpen(state),
    }).toStrictEqual({
      halted: false,
      hud: 0,
      race: null,
      roadTurn: 2,
      seed: 1,
      throttle: false,
    });
  });

  it("moves to the next road and a new seed when the attract race ends", () => {
    const next = attractAfter(attractAfter(attractOn(0)));
    expect({ roadTurn: next.roadTurn, seed: next.seed }).toStrictEqual({
      roadTurn: 2,
      seed: 3,
    });
  });

  it("refuses a pause and leaves for idle when told to stand down", () => {
    const state = attractOn(0);
    expect(pausedFrom(state)).toBe(state);
    expect(stoodDownFrom(state)).toBe(unprepared);
  });
});

describe("preparation", () => {
  const dressing = dressingFor(soloPlan.setup, preparing);
  const preparation = preparationFor(dressing, soloPlan.setup);
  if (preparation?.kind !== "dressing") {
    throw new Error("The dressing session has no preparation.");
  }
  const built = builtFrom(preparation, undressed);

  it("halts the clock and answers for its own setup alone", () => {
    expect(ticksHalted(dressing)).toBeTruthy();
    expect(preparation.preparing).toBe(preparing);
    expect(
      preparationFor(dressing, { ...soloPlan.setup, seed: SEED + 1 })
    ).toBeNull();
  });

  it("keeps the same promise once the race is built, with its dressing", () => {
    const preparationBuilt = preparationFor(built, soloPlan.setup);
    expect(preparationBuilt).toMatchObject({
      dressing: undressed,
      kind: "built",
      setup: soloPlan.setup,
    });
    expect(preparationBuilt?.preparing).toBe(preparing);
    expect(ticksHalted(built)).toBeTruthy();
  });

  it("survives a stand down", () => {
    expect(stoodDownFrom(dressing)).toBe(dressing);
    expect(stoodDownFrom(built)).toBe(built);
  });

  it("is gone once a race is underway", () => {
    expect(preparationFor(counting(), soloPlan.setup)).toBeNull();
    expect(preparationFor(racing(), soloPlan.setup)).toBeNull();
  });
});

describe("countdown", () => {
  it("counts three seconds of ticks with the digits a player reads", () => {
    const state = counting();
    expect(
      walk(
        () => countDown(state),
        () => hudCountdown(state)
      )
    ).toStrictEqual({ digits: [3, 2, 1, 0], ticks: COUNTDOWN_TICKS });
  });

  it("runs the clock and counts as a live race", () => {
    const state = counting();
    expect(ticksHalted(state)).toBeFalsy();
    expect(liveRaceOf(state)).toBe(state);
    expect(throttleOpen(state)).toBeFalsy();
  });

  it("takes a room's time from the room", () => {
    let seconds = 2.5;
    const state = counting(roomPlan(() => seconds));
    expect(countDown(state)).toBeFalsy();
    expect(hudCountdown(state)).toBe(3);
    seconds = -0.1;
    expect(countDown(state)).toBeTruthy();
    expect(hudCountdown(state)).toBe(0);
  });

  it("refuses a pause and hands its plan, log and dressing to the race", () => {
    const state = counting();
    expect(pausedFrom(state)).toBe(state);
    expect(racingFrom(state)).toMatchObject({
      dressing: state.dressing,
      lastStretchSaid: false,
      log: state.log,
      phase: "racing",
      plan: state.plan,
    });
  });
});

describe("pause and resume", () => {
  it("opens the throttle and the clock only while riding", () => {
    const state = racing();
    expect({
      halted: ticksHalted(state),
      hud: hudCountdown(state),
      live: liveRaceOf(state),
      throttle: throttleOpen(state),
    }).toStrictEqual({ halted: false, hud: 0, live: state, throttle: true });
  });

  it("freezes on a pause and refuses a second one", () => {
    const paused = pausedFrom(racing());
    expect(ticksHalted(paused)).toBeTruthy();
    expect(liveRaceOf(paused)).toBeNull();
    expect(hudCountdown(paused)).toBe(0);
    expect(pausedFrom(paused)).toBe(paused);
  });

  it("never pauses a room race", () => {
    const state = racing(roomPlan());
    expect(pausedFrom(state)).toBe(state);
    expect(roomOf(state)).toBe(state.plan.room);
  });

  it("does nothing on a resume with no pause", () => {
    const state = racing();
    expect(resumedFrom(state)).toBe(state);
    expect(resumedFrom(unprepared)).toBe(unprepared);
  });

  it("holds the rider for three seconds of ticks after a resume", () => {
    const state = resumedFrom(pausedFrom(racing()));
    expect(ticksHalted(state)).toBeFalsy();
    expect(liveRaceOf(state)).toBe(state);
    expect(throttleOpen(state)).toBeFalsy();
    expect(
      walk(
        () => spendResumeHold(state) && hudCountdown(state) === 0,
        () => hudCountdown(state)
      )
    ).toStrictEqual({ digits: [3, 2, 1, 0], ticks: COUNTDOWN_TICKS });
    expect(throttleOpen(state)).toBeTruthy();
  });

  it("spends the hold on its own and then steps again", () => {
    const state = resumedFrom(pausedFrom(racing()));
    spendTicks(state, COUNTDOWN_TICKS);
    expect(spendResumeHold(state)).toBeFalsy();
  });

  it("keeps the digit on a pause inside the hold, and a resume starts it again", () => {
    const state = resumedFrom(pausedFrom(racing()));
    spendTicks(state, TICKS_TO_THE_LAST_DIGIT);
    const paused = pausedFrom(state);
    expect(hudCountdown(paused)).toBe(1);
    expect(throttleOpen(paused)).toBeFalsy();
    expect(hudCountdown(resumedFrom(paused))).toBe(3);
  });

  it("spends no hold outside a resume", () => {
    expect(spendResumeHold(racing())).toBeFalsy();
    expect(spendResumeHold(counting())).toBeFalsy();
    expect(spendResumeHold(pausedFrom(racing()))).toBeFalsy();
    expect(spendResumeHold(unprepared)).toBeFalsy();
  });

  it("keeps the last stretch notice through a pause", () => {
    const state = racing();
    state.lastStretchSaid = true;
    expect(resumedFrom(pausedFrom(state))).toMatchObject({
      lastStretchSaid: true,
    });
  });
});

describe("the dev hold", () => {
  it("freezes the race and refuses a pause", () => {
    const state = heldFrom(racing());
    expect(ticksHalted(state)).toBeTruthy();
    expect(liveRaceOf(state)).toBeNull();
    expect(pausedFrom(state)).toBe(state);
  });

  it("releases straight to riding with no resume hold", () => {
    const released = releasedFrom(heldFrom(racing()));
    expect(ticksHalted(released)).toBeFalsy();
    expect(hudCountdown(released)).toBe(0);
    expect(throttleOpen(released)).toBeTruthy();
  });

  it("releases a pause to riding, or to what was left of a hold", () => {
    expect(hudCountdown(releasedFrom(pausedFrom(racing())))).toBe(0);
    const holding = resumedFrom(pausedFrom(racing()));
    spendTicks(holding, TICKS_TO_THE_LAST_DIGIT);
    const released = releasedFrom(pausedFrom(holding));
    expect(ticksHalted(released)).toBeFalsy();
    expect(hudCountdown(released)).toBe(1);
    expect(spendResumeHold(released)).toBeTruthy();
  });

  it("changes nothing on a release when nothing is frozen", () => {
    const state = racing();
    expect(releasedFrom(state)).toBe(state);
    expect(releasedFrom(unprepared)).toBe(unprepared);
  });
});

describe("settling", () => {
  it.each([
    ["busted", BUSTED_TICKS],
    ["wrecked", WRECKED_TICKS],
  ] as const)(
    "%s spends its consequence delay once and then stays over",
    (result, ticks) => {
      const state = settledFrom(racing(), outcomeWith(result));
      expect(ticksOf(() => spendConsequence(state))).toBe(ticks);
      expect(spendConsequence(state)).toBeFalsy();
    }
  );

  it.each(["finished", "quit"] as const)(
    "%s has no delay and never reports one running out",
    (result) => {
      const state = settledFrom(racing(), outcomeWith(result));
      expect(state.overLeft).toBe(0);
      expect(spendConsequence(state)).toBeFalsy();
    }
  );

  it("settles from a countdown as a hidden room race can, with no digit", () => {
    const state = settledFrom(counting(roomPlan()), outcomeWith("wrecked"));
    expect(hudCountdown(state)).toBe(0);
    expect(ticksHalted(state)).toBeFalsy();
  });

  it("carries the outcome and the plan", () => {
    const outcome = outcomeWith("finished");
    const state = settledFrom(racing(), outcome);
    expect(raceOf(state)).toBe(state);
    expect(state.outcome).toBe(outcome);
    expect(state.plan).toBe(soloPlan);
  });

  it("rides on with the clock running, but it is no longer live", () => {
    const state = settledFrom(racing(), outcomeWith("finished"));
    expect(ticksHalted(state)).toBeFalsy();
    expect(liveRaceOf(state)).toBeNull();
    expect(throttleOpen(state)).toBeFalsy();
    expect(pausedFrom(state)).toBe(state);
  });

  it("stays frozen when the dev hold fires on the deciding tick, until released", () => {
    const state = settledFrom(heldFrom(racing()), outcomeWith("busted"));
    expect(ticksHalted(state)).toBeTruthy();
    expect(pausedFrom(state)).toBe(state);
    const released = releasedFrom(state);
    expect(ticksHalted(released)).toBeFalsy();
    expect(raceOf(released)).toMatchObject({ overLeft: 0.8 });
  });

  it("unfreezes on a resume with no hold", () => {
    const state = settledFrom(heldFrom(racing()), outcomeWith("busted"));
    const resumed = resumedFrom(state);
    expect(ticksHalted(resumed)).toBeFalsy();
    expect(hudCountdown(resumed)).toBe(0);
  });
});

describe("standing down", () => {
  it.each([
    ["a countdown", counting()],
    ["a race", racing()],
    ["a paused race", pausedFrom(racing())],
    ["a resume hold", resumedFrom(pausedFrom(racing()))],
    ["a settled race", settledFrom(racing(), outcomeWith("busted"))],
  ])("leaves %s for idle with no digit and no race", (_label, state) => {
    const next = stoodDownFrom(state);
    expect(next).toBe(unprepared);
    expect(hudCountdown(next)).toBe(0);
    expect(raceOf(next)).toBeNull();
    expect(roomOf(next)).toBeUndefined();
  });

  it("does nothing to an idle session", () => {
    expect(stoodDownFrom(unprepared)).toBe(unprepared);
  });
});
