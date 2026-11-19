import { roadLifeSetup } from "@racer/career/bench";
import { emptyFrame } from "@racer/sim/race";
import { createRaceRun } from "@racer/sim/race-run";
import type { RaceRun } from "@racer/sim/race-run";
import { PLAYER_RIDER, riderIdAt, riderOf } from "@racer/sim/state";
import { describe, expect, it } from "vitest";

import { passingField, placeAhead } from "../../test/passing-field.ts";
import { hearPassing, PASSING_VOICES, passingVoices } from "./passing.ts";
import type { Passing } from "./passing.ts";

const BUSY_TICK = 840;
const NOBODY = -1;
const CAR_KEY = 1000;
const OWN_ENGINE_ON_THROTTLE = 0.16;
const GRID_TICK = 1;

const raceAt = (tick: number): RaceRun => {
  const setup = roadLifeSetup();
  const run = createRaceRun({
    ...setup,
    player: { ...setup.player, controller: "pilot" },
  });
  while (run.view.tick < tick) {
    run.step(emptyFrame);
  }
  return run;
};

const heard = (voices: readonly Passing[]): Passing[] =>
  voices.filter((voice) => voice.key !== NOBODY);

describe(hearPassing, () => {
  const run = raceAt(BUSY_TICK);

  it("carries at most four riders or cars, each on one voice", () => {
    const voices = passingVoices();
    hearPassing(run.view, PLAYER_RIDER, voices);
    const keys = heard(voices).map((voice) => voice.key);
    expect(voices).toHaveLength(PASSING_VOICES);
    expect(keys.length).toBeGreaterThan(1);
    expect(new Set(keys).size).toBe(keys.length);
    expect(keys).not.toContain(PLAYER_RIDER);
  });

  it("keeps a rider or car on the voice it had while it stays near", () => {
    const voices = passingVoices();
    hearPassing(run.view, PLAYER_RIDER, voices);
    const before = voices.map((voice) => voice.key);
    hearPassing(run.view, PLAYER_RIDER, voices);
    expect(voices.map((voice) => voice.key)).toStrictEqual(before);
  });

  it("keeps a voice until a newcomer is clearly nearer, so two riders at one distance never swap each frame", () => {
    const race = passingField();
    for (const [index, gap] of [
      [1, 1],
      [2, 2],
      [3, 3],
      [4, 4],
      [5, 6],
    ] as const) {
      placeAhead(race, index, gap);
    }
    const voices = passingVoices();
    const keys = () =>
      voices.map((voice) => voice.key).toSorted((left, right) => left - right);
    hearPassing(race, PLAYER_RIDER, voices);
    expect(keys()).toStrictEqual([1, 2, 3, 4]);
    placeAhead(race, 5, 3.9);
    hearPassing(race, PLAYER_RIDER, voices);
    expect(keys()).toStrictEqual([1, 2, 3, 4]);
    placeAhead(race, 5, 2.5);
    hearPassing(race, PLAYER_RIDER, voices);
    expect(keys()).toStrictEqual([1, 2, 3, 5]);
  });

  it("pans each voice to its side of the road, under your own engine on the throttle", () => {
    const voices = passingVoices();
    hearPassing(run.view, PLAYER_RIDER, voices);
    const me = riderOf(run.view.riders, PLAYER_RIDER);
    const sided = heard(voices).map((voice) => {
      const source =
        voice.key >= CAR_KEY
          ? run.view.cars[voice.key - CAR_KEY]
          : riderOf(run.view.riders, riderIdAt(voice.key));
      return { side: (source?.x ?? 0) - (me?.x ?? 0), voice };
    });
    const clear = sided.filter(({ side }) => Math.abs(side) > 1);
    expect(clear.map(({ voice }) => Math.sign(voice.pan))).toStrictEqual(
      clear.map(({ side }) => Math.sign(side))
    );
    expect(
      sided.every(
        ({ voice }) => voice.gain >= 0 && voice.gain < OWN_ENGINE_ON_THROTTLE
      )
    ).toBeTruthy();
  });

  it("keeps the whole starting grid under your own engine on the throttle", () => {
    const voices = passingVoices();
    hearPassing(raceAt(GRID_TICK).view, PLAYER_RIDER, voices);
    const together = heard(voices).reduce((sum, voice) => sum + voice.gain, 0);
    expect(heard(voices)).toHaveLength(PASSING_VOICES);
    expect(together).toBeLessThan(OWN_ENGINE_ON_THROTTLE * 2);
  });
});
