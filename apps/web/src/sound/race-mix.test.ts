import { PLAYER_RIDER, riderOf } from "@racer/sim/state";
import { describe, expect, it } from "vitest";

import { passingField, placeAhead } from "../../test/passing-field.ts";
import type { Param } from "./glide.ts";
import { PASSING_VOICES } from "./passing.ts";
import { createRaceMix, hearMix, passingOut } from "./race-mix.ts";
import type { PassingParams } from "./race-mix.ts";

type Call = readonly [string, number, number];

const recorded = (calls: Call[]): Param => {
  const param: Param = {
    cancelScheduledValues: (at) => {
      calls.push(["cancel", Number.NaN, at]);
      return param;
    },
    linearRampToValueAtTime: (value, at) => {
      calls.push(["ramp", value, at]);
      return param;
    },
    setTargetAtTime: (value, at) => {
      calls.push(["target", value, at]);
      return param;
    },
    setValueAtTime: (value, at) => {
      calls.push(["set", value, at]);
      return param;
    },
  };
  return param;
};

const outParams = () => {
  const gate: Call[] = [];
  const high: Call[] = [];
  const level: Call[] = [];
  const calls = { gate, high, level };
  const params: PassingParams = {
    gate: recorded(calls.gate),
    high: recorded(calls.high),
    level: recorded(calls.level),
    low: recorded([]),
    mix: recorded([]),
    pan: recorded([]),
    tone: recorded([]),
  };
  return { calls, params };
};

describe(hearMix, () => {
  it("fades a passing voice out before it takes another vehicle's pitch, then fades it in", () => {
    const race = passingField();
    for (const [index, gap] of [
      [1, 1],
      [2, 2],
      [3, 3],
      [4, 4],
      [5, 9],
    ] as const) {
      placeAhead(race, index, gap);
    }
    const idle = riderOf(race.riders, placeAhead(race, 4, 4));
    const revving = riderOf(race.riders, placeAhead(race, 5, 9));
    if (idle && revving) {
      idle.revs = 0;
      revving.revs = 1;
    }
    const mix = createRaceMix();
    const outs = Array.from({ length: PASSING_VOICES }, outParams);
    for (const { params } of outs) {
      mix.outs.push(passingOut(params));
    }
    hearMix(mix, race, PLAYER_RIDER, 0);
    hearMix(mix, race, PLAYER_RIDER, 0.5);
    const handed = mix.outs.findIndex((out) => out.key === 4);
    const { calls } = outs[handed] ?? outParams();
    const before = calls.high.length;
    const gateBefore = calls.gate.length;
    const oldPitch = calls.high.at(-1)?.[1];
    placeAhead(race, 5, 2);
    hearMix(mix, race, PLAYER_RIDER, 1);
    const quiet = calls.gate
      .slice(gateBefore)
      .find(([kind, value]) => kind === "ramp" && value === 0);
    const retuned = calls.high.slice(before);
    expect({
      fadedAfterNow: (quiet?.[2] ?? 0) > 1,
      key: mix.outs[handed]?.key,
      retuned: retuned.length > 0,
    }).toStrictEqual({ fadedAfterNow: true, key: 5, retuned: true });
    expect(
      retuned.every(
        ([kind, , at]) => kind === "cancel" || at >= (quiet?.[2] ?? 1)
      )
    ).toBeTruthy();
    expect(retuned.at(-1)?.[1]).not.toBe(oldPitch);
    expect(calls.gate.at(-1)).toStrictEqual([
      "ramp",
      1,
      (quiet?.[2] ?? 0) + 0.06,
    ]);
  });
});
