import { recordedRules } from "@racer/career/bench";
import { abandonedOutcome, createRaceLog } from "@racer/career/outcome";
import type { RaceResult } from "@racer/career/outcome";
import type { RoomRun } from "@racer/rooms/room-run";
import { createRace, defaultSetup, neutralInput } from "@racer/sim/race";
import { playerFrame } from "@racer/sim/race-fixtures";
import { createRaceRun } from "@racer/sim/race-run";
import type { RaceRun } from "@racer/sim/race-run";
import { PLAYER_RIDER, riderIdAt, riderOf } from "@racer/sim/state";
import type { RaceEvent, RaceState } from "@racer/sim/state";
import { trackFor } from "@racer/track/roads";
import type { Track } from "@racer/track/track";
import { afterEach, describe, expect, it, vi } from "vitest";

import { roomRunStub } from "../../test/room-run-stub.ts";
import { firstQuickPick, planFor, quickEntry } from "../career/flow.ts";
import type { Sound } from "../sound/sound.ts";
import { releaseAll } from "./dispose.ts";
import { undressed } from "./figure-wardrobe.ts";
import {
  attractOn,
  countDown,
  countdownFor,
  racingFrom,
} from "./game-session.ts";
import type { Session } from "./game-session.ts";
import type { RacePlan } from "./hud.ts";
import { bindFeedback, createFeedback } from "./race-feedback.ts";

const RIVAL = riderIdAt(1);
const SETTLE_TICKS = 120;
const SEED = 31;
const HELD_MS = 600;

const feedbackOn = (race: RaceRun, track: Track, session: () => Session) => {
  const play = vi.fn<Sound["play"]>();
  const hush = vi.fn<() => void>();
  const owners: (() => void)[] = [];
  const player = () => {
    const me = riderOf(race.view.riders, PLAYER_RIDER);
    if (!me) {
      throw new Error("The race has no player.");
    }
    return me;
  };
  const { react, report, settled } = bindFeedback({
    chase: { bump: vi.fn<() => void>(), jolt: vi.fn<() => void>() },
    drawnSpeed: () => 0,
    events: { onHud: vi.fn<() => void>() },
    feedback: createFeedback(),
    owners,
    player,
    recorder: { race: vi.fn<() => void>() },
    session,
    sound: {
      hush,
      muted: () => false,
      play,
      toggleMute: vi.fn<() => void>(),
    },
    stage: { me: PLAYER_RIDER, race, track },
  });
  return { hush, owners, play, player, race, react, report, settled };
};

const heardFeedback = () => {
  const track = trackFor("ridge-road");
  const race = createRaceRun(defaultSetup(track, 7));
  for (let tick = 0; tick < SETTLE_TICKS; tick += 1) {
    race.step(playerFrame(neutralInput));
  }
  return feedbackOn(race, track, () => attractOn(0));
};

const plan: RacePlan = planFor(
  recordedRules,
  null,
  quickEntry(firstQuickPick, SEED)
);

const outcomeOf = (result: RaceResult) => ({
  ...abandonedOutcome(recordedRules, {
    bikeId: firstQuickPick.bikeId,
    raceId: plan.setup.raceId,
    roadId: plan.setup.roadId,
    seed: SEED,
    started: true,
    tier: plan.setup.tier,
  }),
  result,
});

const lineUp = (race: RaceState, rivalAhead: boolean): void => {
  for (const rider of race.riders) {
    rider.bodyS = 0;
  }
  const me = riderOf(race.riders, PLAYER_RIDER);
  const rival = riderOf(race.riders, RIVAL);
  if (me && rival) {
    me.bodyS = 100;
    rival.bodyS = rivalAhead ? 100.1 : 99.9;
  }
};

const roomFeedback = () => {
  const predicted = createRace(plan.setup);
  const confirmed = createRace(plan.setup);
  lineUp(predicted, false);
  lineUp(confirmed, false);
  let restores = 0;
  let seconds = 3;
  const room: RoomRun = {
    ...roomRunStub(plan.setup, "test-room", () => seconds),
    confirmed,
    restores: () => restores,
    view: predicted,
  };
  const counting = countdownFor(
    { ...plan, room },
    createRaceLog(plan.setup),
    undressed
  );
  let state: Session = racingFrom(counting);
  const heard = feedbackOn(room, plan.setup.track, () => state);
  const held = (): void => {
    heard.report();
    vi.advanceTimersByTime(HELD_MS);
    heard.report();
  };
  return {
    ...heard,
    confirmed,
    count: (next: number) => {
      seconds = next;
      state = counting;
      countDown(counting);
      heard.report();
    },
    go: () => {
      state = racingFrom(counting);
      heard.report();
    },
    held,
    predicted,
    restore: () => {
      restores += 1;
    },
  };
};

const cuesOf = (play: ReturnType<typeof heardFeedback>["play"]) =>
  play.mock.calls.map(([cue]) => cue);

const swingWith = (weapon: "chain" | "club" | "none"): RaceEvent => ({
  attack: "swing",
  kind: "hit",
  rider: PLAYER_RIDER,
  target: RIVAL,
  weapon,
});

describe("race sounds from race events", () => {
  it("plays each weapon's own hit, and a fist for none", () => {
    const { play, react } = heardFeedback();
    react([swingWith("chain"), swingWith("club"), swingWith("none")]);
    expect(cuesOf(play)).toStrictEqual(["chainHit", "clubHit", "hit"]);
  });

  it("plays another rider's hit and crash quieter, from where they are", () => {
    const { play, player, race, react } = heardFeedback();
    react([
      {
        attack: "punch",
        kind: "hit",
        rider: riderIdAt(2),
        target: RIVAL,
        weapon: "none",
      },
      {
        by: null,
        cause: "traffic",
        hazard: null,
        kind: "crash",
        rider: RIVAL,
        speed: 30,
      },
    ]);
    const rival = riderOf(race.view.riders, RIVAL);
    const side = Math.sign((rival?.x ?? 0) - player().x);
    expect(cuesOf(play)).toStrictEqual(["hit", "crash"]);
    for (const [, pan = 0, gain = 1] of play.mock.calls) {
      expect(gain).toBeLessThan(1);
      expect(Math.sign(pan)).toBe(side);
    }
  });

  it("plays the landing, and the finish when you cross the line", () => {
    const { play, react } = heardFeedback();
    react([
      {
        airSeconds: 0.6,
        impact: -6,
        kind: "land",
        rider: PLAYER_RIDER,
        s: 0,
        x: 0,
      },
    ]);
    expect(cuesOf(play)).toStrictEqual(["land"]);
  });

  it("plays the finish once, when the race settles a finish, never from a predicted crossing", () => {
    const { play, react, settled } = heardFeedback();
    const crossed: RaceEvent = {
      kind: "finish",
      rider: PLAYER_RIDER,
      tick: 900,
    };
    react([crossed]);
    react([crossed]);
    settled(outcomeOf("busted"));
    expect(cuesOf(play)).toStrictEqual([]);
    settled(outcomeOf("finished"));
    expect(cuesOf(play)).toStrictEqual(["finish"]);
  });
});

describe("room race sounds", () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it("calls a place change only once the room confirms it", () => {
    vi.useFakeTimers({ toFake: ["performance"] });
    const { confirmed, held, play, predicted } = roomFeedback();
    held();
    lineUp(predicted, true);
    held();
    expect(cuesOf(play)).toStrictEqual([]);
    lineUp(confirmed, true);
    held();
    expect(cuesOf(play)).toStrictEqual(["lost"]);
  });

  it("calls no overtake for a place a restored room state jumps to", () => {
    vi.useFakeTimers({ toFake: ["performance"] });
    const { confirmed, held, play, restore } = roomFeedback();
    held();
    restore();
    lineUp(confirmed, true);
    held();
    expect(cuesOf(play)).toStrictEqual([]);
  });

  it("sounds each countdown number once, even when the room clock moves it back", () => {
    const { count, go, play } = roomFeedback();
    for (const seconds of [2.5, 1.5, 2.5, 1.5, 0.5]) {
      count(seconds);
    }
    go();
    go();
    expect(cuesOf(play)).toStrictEqual(["count", "count", "count", "go"]);
  });
});

describe(bindFeedback, () => {
  it("silences the race's engine and wind when the game is released", () => {
    const { hush, owners } = heardFeedback();
    expect(hush).not.toHaveBeenCalled();
    releaseAll(owners);
    expect(hush).toHaveBeenCalledOnce();
  });
});
