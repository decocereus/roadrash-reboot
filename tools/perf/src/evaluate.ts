import * as Schema from "effect/Schema";

import { judge, metricKinds, proposeLimits, requiredRows } from "./budgets.ts";
import type { Budgets, Limit, NodeProfile, Observation } from "./budgets.ts";
import { buildRecord, buildVerdicts } from "./build.ts";
import { nodeEnvironment, nodeLaneRecord, nodeVerdicts } from "./node-lane.ts";
import type { NodeLane } from "./node-lane.ts";
import { CALIBRATION_ROUNDS, CALIBRATION_VERSION } from "./node.ts";
import { median } from "./result.ts";
import { scenarioHash, scenarios } from "./scenarios.ts";
import { sideIdentity } from "./sides.ts";

export const portableLanes = ["node", "build"] as const;

type PortableLane = (typeof portableLanes)[number];

export const samplesRecord = Schema.Struct({
  build: Schema.NullOr(Schema.Struct({ A: buildRecord, B: buildRecord })),
  comparisonId: Schema.String,
  lanes: Schema.Array(Schema.Literals(portableLanes)),
  mode: Schema.Literals(["gate", "baseline"]),
  node: Schema.Array(nodeLaneRecord),
  sides: Schema.Struct({ A: sideIdentity, B: sideIdentity }),
  version: Schema.Literal(1),
});

export type Samples = typeof samplesRecord.Type;

const PROFILE_SCALE = { max: 2, min: 0.5 };
const PROFILE_MAX_DRIFT = 0.1;

const observe = (
  samples: Samples,
  profiles: Readonly<Record<string, NodeProfile>>
) => {
  const failures: string[] = [];
  const observations: Observation[] = [];
  let environment = "node-unknown";
  if (samples.sides.A.harnessDigest !== samples.sides.B.harnessDigest) {
    failures.push(
      `FAIL harness A=${samples.sides.A.harnessDigest.slice(0, 12)} B=${samples.sides.B.harnessDigest.slice(0, 12)} ran different harnesses`
    );
  }
  if (samples.lanes.includes("node")) {
    for (const scenario of scenarios) {
      const lane = samples.node.find((each) => each.scenario === scenario.id);
      if (lane) {
        const verdict = nodeVerdicts(
          scenario,
          lane,
          scenarioHash(scenario),
          profiles
        );
        ({ environment } = verdict);
        failures.push(...verdict.failures);
        observations.push(...verdict.observations);
      } else {
        failures.push(`FAIL node ${scenario.id} has no samples`);
      }
    }
  }
  if (samples.lanes.includes("build")) {
    if (samples.build) {
      const verdict = buildVerdicts(samples.build.A, samples.build.B);
      failures.push(...verdict.failures);
      observations.push(...verdict.observations);
    } else {
      failures.push("FAIL bytes no build records");
    }
  }
  return { environment, failures, observations };
};

const missingLanes = (samples: Samples): PortableLane[] =>
  portableLanes.filter((lane) => !samples.lanes.includes(lane));

const incompleteLine = (samples: Samples): string[] => {
  const missing = missingLanes(samples);
  return missing.length === 0
    ? []
    : [`INCOMPLETE required lanes not run: ${missing.join(", ")}`];
};

export interface Evaluation {
  readonly ok: boolean;
  readonly lines: readonly string[];
  readonly environment: string;
  readonly observations: readonly Observation[];
}

export const evaluateGate = (
  samples: Samples,
  budgets: Budgets
): Evaluation => {
  const observed = observe(samples, budgets.nodeProfiles);
  const verdicts = judge(
    budgets.limits,
    observed.observations,
    requiredRows(samples.lanes, [observed.environment])
  );
  const incomplete = incompleteLine(samples);
  return {
    environment: observed.environment,
    lines: [
      ...observed.failures,
      ...verdicts.map((verdict) => verdict.text),
      ...incomplete,
    ],
    observations: observed.observations,
    ok:
      observed.failures.length === 0 &&
      incomplete.length === 0 &&
      verdicts.every((verdict) => verdict.ok),
  };
};

const profileOf = (lanes: readonly NodeLane[]): NodeProfile | null => {
  const calibrations = lanes.flatMap((lane) => lane.calibrations);
  const [first] = calibrations;
  if (!first) {
    return null;
  }
  const checksums = new Set(
    calibrations.flatMap((each) => each.record.calibration?.checksums ?? [])
  );
  const [checksum = -1] = checksums.size === 1 ? checksums : [];
  return {
    arch: first.record.runtime.arch,
    calibration: {
      checksum,
      maxDrift: PROFILE_MAX_DRIFT,
      maxScale: PROFILE_SCALE.max,
      median: median(
        calibrations.map((each) =>
          median(each.record.calibration?.durations ?? [])
        )
      ),
      minScale: PROFILE_SCALE.min,
      rounds: CALIBRATION_ROUNDS,
      version: CALIBRATION_VERSION,
    },
    platform: first.record.runtime.platform,
  };
};

const BYTE_MARGIN = { floor: 4096, share: 0.02 };

const allowance = (observation: Observation): number | null => {
  const kind = metricKinds.find((each) => each.metric === observation.metric);
  if (!kind) {
    return null;
  }
  if (kind.lane === "build") {
    return kind.metric.startsWith("assets.glb.")
      ? 0
      : Math.max(
          BYTE_MARGIN.floor,
          Math.ceil(BYTE_MARGIN.share * observation.value)
        );
  }
  return kind.paired === null ? null : Math.abs(kind.paired - 1);
};

const percent = (value: number): string => `${(value * 100).toFixed(2)}%`;

const spreadLine = (observation: Observation): string => {
  const margin = allowance(observation);
  const where = `${observation.lane} ${observation.scenario ?? "-"} ${observation.metric}`;
  const a = observation.runs.a[0] ?? Number.NaN;
  if (observation.lane === "build") {
    const delta = Math.abs(observation.value - a);
    const over = margin === null || delta > margin;
    return `${over ? "OVER" : "ok  "} A/A ${where} A=${a} B=${observation.value} |delta|=${delta} B margin=${margin ?? "none"} B`;
  }
  const ratios = observation.runs.b.map(
    (value, index) => value / (observation.runs.a[index] ?? Number.NaN)
  );
  const all = [...observation.runs.a, ...observation.runs.b];
  const center = median(all);
  const runSpread = (Math.max(...all) - Math.min(...all)) / center;
  const pairedDrift = Math.abs((observation.paired ?? Number.NaN) - 1);
  const worstPair = Math.max(...ratios.map((ratio) => Math.abs(ratio - 1)));
  const over =
    margin === null || !(pairedDrift <= margin && worstPair <= margin);
  return `${over ? "OVER" : "ok  "} A/A ${where} value=${observation.value.toPrecision(5)} paired=${(observation.paired ?? Number.NaN).toFixed(4)} |paired-1|=${percent(pairedDrift)} worst pair=${percent(worstPair)} run range=${percent(runSpread)} margin=${margin === null ? "none" : percent(margin)}`;
};

export interface BaselineEvaluation extends Evaluation {
  readonly proposal: {
    readonly limits: readonly Limit[];
    readonly nodeProfiles: Readonly<Record<string, NodeProfile>>;
  };
}

export const evaluateBaseline = (samples: Samples): BaselineEvaluation => {
  const profile = profileOf(samples.node);
  const [first] = samples.node.flatMap((lane) => lane.calibrations);
  const profiles: Record<string, NodeProfile> =
    profile && first ? { [nodeEnvironment(first.record)]: profile } : {};
  const observed = observe(samples, profiles);
  const required = requiredRows(samples.lanes, [observed.environment]);
  const limits = proposeLimits(observed.observations, required);
  const incomplete = incompleteLine(samples);
  const lines = [
    "MEASUREMENT ONLY: baseline proposal, not a gate result",
    ...observed.failures,
    ...observed.observations.map(spreadLine),
    ...incomplete,
  ];
  return {
    environment: observed.environment,
    lines,
    observations: observed.observations,
    ok:
      observed.failures.length === 0 &&
      incomplete.length === 0 &&
      limits.length === required.length,
    proposal: { limits, nodeProfiles: profiles },
  };
};

export const lanesOf = (text: string): PortableLane[] | null => {
  const names = text.split(",").filter((name) => name !== "");
  const lanes = portableLanes.filter((lane) => names.includes(lane));
  return names.length > 0 && lanes.length === names.length ? lanes : null;
};
