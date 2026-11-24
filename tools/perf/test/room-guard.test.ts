import { readFileSync } from "node:fs";
import path from "node:path";
import { gunzipSync } from "node:zlib";

import * as Schema from "effect/Schema";
import { describe, expect, it } from "vitest";

import { budgetsFile, judge, metricKinds } from "../src/budgets.ts";
import type { Observation } from "../src/budgets.ts";
import { scenarios } from "../src/scenarios.ts";
import { roomRecording } from "../src/worst-run.ts";
import type { RoomRecording } from "../src/worst-run.ts";

const { limits } = Schema.decodeUnknownSync(Schema.fromJsonString(budgetsFile))(
  readFileSync(path.join(import.meta.dirname, "../budgets.json"), "utf-8")
);

type RoomRun = RoomRecording["runs"][number];

const recorded = (environment: string): readonly RoomRun[] =>
  Schema.decodeUnknownSync(Schema.fromJsonString(roomRecording))(
    gunzipSync(
      readFileSync(
        path.join(
          import.meta.dirname,
          `../baselines/room.${environment}.json.gz`
        )
      )
    ).toString("utf-8")
  ).runs;

const timed = ["room.tick.p95", "room.confirm.p95", "room.rollback.p95"];
const checkpoint = "room.checkpoint.p50";
const rows = [...timed, checkpoint];

const verdicts = (
  environment: string,
  run: RoomRun,
  slower: (metric: string) => number
) =>
  run.scenarios.flatMap(({ rows: measured, scenario }) =>
    rows.map((metric) => {
      const kind = metricKinds.find((each) => each.metric === metric);
      const known = scenarios.find((each) => each.id === scenario);
      const value = measured[metric]?.value;
      if (!kind || !known || value === undefined) {
        throw new Error(`${run.id} ${scenario} records no ${metric}`);
      }
      const observed: Observation = {
        environment,
        lane: "node",
        metric,
        note: "",
        paired: null,
        runs: { a: [], b: [value] },
        scenario,
        value: value * slower(metric),
      };
      const [verdict] = judge(
        limits,
        [observed],
        [{ environment, kind, scenario: known.id }],
        run.cpu
      );
      return { metric, ok: verdict?.ok === true, scenario };
    })
  );

const commonRunner = "Intel(R) Xeon(R) 6975P-C";

describe("pooled room rows on recorded runs against the committed limits", () => {
  it.each(["node-linux-x64", "node-darwin-arm64"])(
    "passes every clean recorded run on every CPU in %s",
    (environment) => {
      const runs = recorded(environment);
      expect(runs.length).toBeGreaterThanOrEqual(3);
      const failed = runs.flatMap((run) =>
        verdicts(environment, run, () => 1)
          .filter((each) => !each.ok)
          .map((each) => `${run.cpu} ${run.id} ${each.scenario} ${each.metric}`)
      );
      expect(failed).toStrictEqual([]);
    }
  );

  it("fails every tick, confirm and rollback row of every recorded 6975P-C run when they get 30% slower", () => {
    const runs = recorded("node-linux-x64").filter(
      (run) => run.cpu === commonRunner
    );
    expect(runs.length).toBeGreaterThanOrEqual(3);
    const passed = runs.flatMap((run) =>
      verdicts("node-linux-x64", run, (metric) =>
        timed.includes(metric) ? 1.3 : 1
      )
        .filter((each) => timed.includes(each.metric) && each.ok)
        .map((each) => `${run.id} ${each.scenario} ${each.metric}`)
    );
    expect(passed).toStrictEqual([]);
  });

  it("fails the checkpoint row of every recorded 6975P-C run but at most the one that needs the largest slowdown when its checkpoints get 30% slower, and pins that slowdown", () => {
    const runs = recorded("node-linux-x64").filter(
      (run) => run.cpu === commonRunner
    );
    expect(runs.length).toBeGreaterThanOrEqual(3);
    const passed = new Set(
      runs.flatMap((run) =>
        verdicts("node-linux-x64", run, (metric) =>
          metric === checkpoint ? 1.3 : 1
        )
          .filter((each) => each.metric === checkpoint && each.ok)
          .map(() => run.id)
      )
    );
    const needs = runs.flatMap((run) =>
      run.scenarios.map(({ rows: measured, scenario }) => {
        const limit = limits.find(
          (each) =>
            each.environment === "node-linux-x64" &&
            each.metric === checkpoint &&
            each.scenario === scenario &&
            each.runner === commonRunner
        );
        const value = measured[checkpoint]?.value;
        if (!limit || value === undefined) {
          throw new Error(`${run.id} ${scenario} has no ${checkpoint} limit`);
        }
        return { id: run.id, slowdown: limit.value / value - 1 };
      })
    );
    const [most] = needs.toSorted(
      (left, right) => right.slowdown - left.slowdown
    );
    expect(passed.size).toBeLessThanOrEqual(1);
    expect([...passed].every((id) => id === most?.id)).toBeTruthy();
    expect(Math.round((most?.slowdown ?? 0) * 100)).toBe(63);
  });
});
