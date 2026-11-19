import { roadLifeSetup } from "@racer/career/bench";
import { neutralInput } from "@racer/sim/race";
import { playerFrame } from "@racer/sim/race-fixtures";
import { createRaceRun } from "@racer/sim/race-run";
import type { RaceRun } from "@racer/sim/race-run";
import { PLAYER_RIDER } from "@racer/sim/state";
import { describe, expect, it } from "vitest";

import { hearPassing, PASSING_VOICES, passingVoices } from "./passing.ts";
import type { Passing } from "./passing.ts";

const BUSY_TICK = 840;
const NOBODY = -1;
const CAR_KEY = 1000;

const busyRace = (): RaceRun => {
  const setup = roadLifeSetup();
  const run = createRaceRun({
    ...setup,
    player: { ...setup.player, controller: "pilot" },
  });
  while (run.view.tick < BUSY_TICK) {
    run.step(playerFrame(neutralInput));
  }
  return run;
};

const heard = (voices: readonly Passing[]): Passing[] =>
  voices.filter((voice) => voice.key !== NOBODY);

describe(hearPassing, () => {
  const run = busyRace();

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
    expect(voices.some((voice) => voice.fresh)).toBe(false);
  });

  it("pans each voice to the side of the road it is on and fades it with distance", () => {
    const voices = passingVoices();
    hearPassing(run.view, PLAYER_RIDER, voices);
    const me = run.view.riders[PLAYER_RIDER];
    for (const voice of heard(voices)) {
      const source =
        voice.key >= CAR_KEY
          ? run.view.cars[voice.key - CAR_KEY]
          : run.view.riders[voice.key];
      const side = (source?.x ?? 0) - (me?.x ?? 0);
      if (Math.abs(side) > 1) {
        expect(Math.sign(voice.pan)).toBe(Math.sign(side));
      }
      expect(voice.gain).toBeGreaterThanOrEqual(0);
      expect(voice.gain).toBeLessThan(0.6);
    }
  });
});
