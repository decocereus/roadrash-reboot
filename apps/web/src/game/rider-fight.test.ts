import { riderIdAt } from "@racer/sim/state";
import { describe, expect, it } from "vitest";

import {
  quietFight,
  fightHeard,
  fightTick,
  flinchHeard,
  fightFlinch,
  strikeFrame,
} from "./rider-fight.ts";
import type { StrikeFrame } from "./rider-fight.ts";

const KICK_TICKS = 15;
const kick = {
  attack: "kick",
  kind: "attack",
  rider: riderIdAt(1),
  side: -1,
  weapon: "none",
} as const;

const framesOf = (ticks: number) => {
  const fight = quietFight();
  const frame: StrikeFrame = { pose: "seated", reach: 0, rise: 0 };
  fightHeard(fight, kick);
  const reaches: number[] = [];
  for (let tick = 0; tick < ticks; tick += 1) {
    reaches.push(strikeFrame(fight, 0, frame) ? frame.reach : -1);
    fightTick(fight, false);
  }
  return { fight, frame, reaches };
};

describe("how a rider's strike plays once it is heard", () => {
  it("plays from the first frame however late it was heard", () => {
    const { reaches } = framesOf(KICK_TICKS);
    expect(reaches[0]).toBe(0);
    expect(reaches[4]).toBe(1);
    expect(reaches.at(-1)).toBe(-1);
  });

  it("takes the side the event named", () => {
    const { fight } = framesOf(1);
    expect(fight.side).toBe(-1);
  });

  it("is quiet until a strike is heard, and quiet again after it", () => {
    const frame: StrikeFrame = { pose: "seated", reach: 0, rise: 0 };
    const fight = quietFight();
    expect(strikeFrame(fight, 0, frame)).toBeFalsy();
    fightHeard(fight, kick);
    fight.elapsed = KICK_TICKS;
    expect(strikeFrame(fight, 0, frame)).toBeFalsy();
    expect(fight.attack).toBe("none");
  });

  it("stops a strike when the rider leaves the ground", () => {
    const { fight, frame } = framesOf(2);
    fightTick(fight, true);
    expect(strikeFrame(fight, 0, frame)).toBeFalsy();
  });

  it("flinches from a heard hit when the prediction has no stun left", () => {
    const fight = quietFight();
    flinchHeard(fight);
    expect(fightFlinch(fight, 0, 0)).toBe(1);
    fightTick(fight, false);
    expect(fightFlinch(fight, 0, 0)).toBeCloseTo(0.9);
  });
});
