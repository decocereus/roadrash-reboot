import { describe, expect, it } from "vitest";

import {
  CHECKS,
  configOf,
  GUARD_OFFS,
  GUARDS,
  RULES,
} from "../src/lifecycle-checks.ts";
import { outcomeOf } from "../src/lifecycle-tlc.ts";
import { traceOf, traceText } from "../src/lifecycle-trace.ts";

const PASSED = [
  "Progress(12) at 2026-11-06 10:00:00: 1,000 states generated, 500 distinct states found, 40 states left on queue.",
  "Model checking completed. No error has been found.",
  "12,345 states generated, 6,789 distinct states found, 0 states left on queue.",
  "The depth of the complete state graph search is 42.",
].join("\n");

const TRACE = [
  "Error: Invariant LeaveFreesSpot is violated.",
  "Error: The behavior up to this point is:",
  "State 1: <Initial predicate>",
  '/\\ room = [ mem |-> (a :> "none"), out |-> (<<a, 1>> :> <<>>) ]',
  '/\\ tab = ( a :> [ page |-> "bar", acts |-> 0 ] )',
  "",
  "State 2: <EnterRoom line 636, col 5 to line 639, col 31 of module RoomLifecycle>",
  '/\\ tab = ( a :> [ page |-> "reloading", acts |-> 1 ] )',
  "",
  "State 3: <HostRecv line 367, col 5 to line 372, col 20 of module RoomLifecycle>",
  '/\\ room = [ mem |-> (a :> "here"), out |-> (<<a, 1>> :> <<"lobby">>) ]',
  "",
  "Back to state 2: <Tick line 778, col 5 to line 789, col 83 of module RoomLifecycle>",
  "",
].join("\n");

describe("the room lifecycle checks", () => {
  it("breaks each guard-off on bounds whose own check holds that rule", () => {
    const unchecked = GUARDS.filter((guard) => {
      const { breaks, on } = GUARD_OFFS[guard];
      return !CHECKS[on].rules.includes(breaks);
    });
    expect(unchecked).toStrictEqual([]);
  });

  it("protects every rule with a guard whose removal must break it", () => {
    const guarded = new Set(GUARDS.map((guard) => GUARD_OFFS[guard].breaks));
    expect(RULES.filter((rule) => !guarded.has(rule))).toStrictEqual([]);
  });

  it("turns off only the named guard", () => {
    const config = configOf(
      CHECKS.pair.bounds,
      ["SeatsCanRide"],
      "GuardDropRetires"
    );
    const off = config.split("\n").filter((line) => line.endsWith("= FALSE"));
    expect(off).toStrictEqual(["    GuardDropRetires = FALSE"]);
  });

  it("uses rider symmetry only where no liveness rule is checked", () => {
    expect(configOf(CHECKS.pair.bounds, CHECKS.pair.rules, null)).toContain(
      "SYMMETRY RiderSymmetry"
    );
    expect(configOf(CHECKS.pair.bounds, ["NeverStuck"], null)).not.toContain(
      "SYMMETRY"
    );
  });
});

describe("a TLC run's outcome", () => {
  it("reads the final state count, not a progress line", () => {
    expect(outcomeOf(0, PASSED)).toStrictEqual({
      depth: 42,
      distinct: 6789,
      kind: "passed",
    });
  });

  it("names the rule a counterexample breaks", () => {
    expect(outcomeOf(12, TRACE)).toStrictEqual({
      kind: "broken",
      rule: "LeaveFreesSpot",
    });
    expect(
      outcomeOf(13, "Error: Action property SeatsCanRide is violated.")
    ).toStrictEqual({ kind: "broken", rule: "SeatsCanRide" });
    expect(
      outcomeOf(13, "Error: Temporal properties were violated.")
    ).toStrictEqual({ kind: "broken", rule: "liveness" });
    expect(outcomeOf(11, "Error: Deadlock reached.")).toStrictEqual({
      kind: "broken",
      rule: "deadlock",
    });
  });

  it("fails a run that broke no rule of ours", () => {
    expect(outcomeOf(12, "Error: Invariant TypeOK is violated.")).toStrictEqual(
      {
        kind: "failed",
        reason: "Error: Invariant TypeOK is violated.",
      }
    );
    expect(outcomeOf(1, "Exception in thread main")).toStrictEqual({
      kind: "failed",
      reason: "TLC exited 1.",
    });
  });
});

describe("a TLC counterexample trace", () => {
  it("lists each step's action and only the fields it changed", () => {
    expect(traceOf(TRACE)).toStrictEqual([
      { action: "Initial predicate", changes: [], state: 1 },
      {
        action: "EnterRoom",
        changes: ['tab[a].page = "reloading"', "tab[a].acts = 1"],
        state: 2,
      },
      {
        action: "HostRecv",
        changes: ['room.mem[a] = "here"', 'room.out[<<a, 1>>] = <<"lobby">>'],
        state: 3,
      },
    ]);
  });

  it("says where a liveness counterexample loops", () => {
    expect(traceText(TRACE).split("\n").at(-1)).toBe(
      "then back to state 2, for ever"
    );
  });
});
