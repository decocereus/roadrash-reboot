import { defaultSetup, neutralInput } from "@racer/sim/race";
import { playerFrame } from "@racer/sim/race-fixtures";
import { createRaceRun } from "@racer/sim/race-run";
import { PLAYER_RIDER, riderIdAt, riderOf } from "@racer/sim/state";
import type { RaceEvent } from "@racer/sim/state";
import { trackFor } from "@racer/track/roads";
import { describe, expect, it, vi } from "vitest";

import type { Sound } from "../sound/sound.ts";
import { releaseAll } from "./dispose.ts";
import { attractOn } from "./game-session.ts";
import { bindFeedback, createFeedback } from "./race-feedback.ts";

const RIVAL = riderIdAt(1);
const SETTLE_TICKS = 120;

const heardFeedback = () => {
  const track = trackFor("ridge-road");
  const race = createRaceRun(defaultSetup(track, 7));
  for (let tick = 0; tick < SETTLE_TICKS; tick += 1) {
    race.step(playerFrame(neutralInput));
  }
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
  const { react } = bindFeedback({
    chase: { bump: vi.fn<() => void>(), jolt: vi.fn<() => void>() },
    drawnSpeed: () => 0,
    events: { onHud: vi.fn<() => void>() },
    feedback: createFeedback(),
    owners,
    player,
    recorder: { race: vi.fn<() => void>() },
    session: () => attractOn(0),
    sound: {
      hush,
      muted: () => false,
      play,
      toggleMute: vi.fn<() => void>(),
    },
    stage: { me: PLAYER_RIDER, race, track },
  });
  return { hush, owners, play, player, race, react };
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
      { kind: "finish", rider: PLAYER_RIDER, tick: 900 },
      { kind: "finish", rider: RIVAL, tick: 905 },
    ]);
    expect(cuesOf(play)).toStrictEqual(["land", "finish"]);
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
