import { parseArgs } from "node:util";

import { browserNamed } from "@racer/devtools/chrome";
import type { BrowserChoice, Viewport } from "@racer/devtools/chrome";
import { benchWindows } from "@racer/sim/bench-window";

export interface Options {
  readonly url: string;
  readonly browser: BrowserChoice;
  readonly label: string;
  readonly runs: number;
  readonly from: number;
  readonly to: number;
  readonly port: number;
  readonly out: string;
  readonly trace: boolean;
  readonly cpuProfile: boolean;
  readonly allocProfile: boolean;
  readonly saveTrace: boolean;
  readonly shots: readonly number[];
  readonly viewport: Viewport;
  readonly firstRun: boolean;
  readonly worst: number;
}

export const readOptions = (): Options => {
  const { values } = parseArgs({
    options: {
      "alloc-profile": { default: false, type: "boolean" },
      browser: { default: "chrome", type: "string" },
      "cpu-profile": { default: false, type: "boolean" },
      "first-run": { default: false, type: "boolean" },
      from: { type: "string" },
      height: { default: "860", type: "string" },
      label: { default: "run", type: "string" },
      "no-trace": { default: false, type: "boolean" },
      out: { default: "tools/perf/results", type: "string" },
      port: { default: "9333", type: "string" },
      runs: { default: "3", type: "string" },
      "save-trace": { default: false, type: "boolean" },
      scale: { default: "2", type: "string" },
      shots: { default: "", type: "string" },
      to: { default: String(benchWindows.stress.to), type: "string" },
      url: { type: "string" },
      width: { default: "1512", type: "string" },
      worst: { default: "5", type: "string" },
    },
  });
  if (values.url === undefined || values.url === "") {
    throw new Error(
      "Pass --url, for example http://localhost:1352/?stress&ratio=2"
    );
  }
  const firstRun = values["first-run"];
  return {
    allocProfile: values["alloc-profile"],
    browser: browserNamed(values.browser),
    cpuProfile: values["cpu-profile"],
    firstRun,
    from: Number(values.from ?? (firstRun ? 1 : benchWindows.stress.from)),
    label: values.label,
    out: values.out,
    port: Number(values.port),
    runs: Number(values.runs),
    saveTrace: values["save-trace"],
    shots: values.shots
      .split(",")
      .filter(Boolean)
      .map(Number)
      .toSorted((a, b) => a - b),
    to: Number(values.to),
    trace: !values["no-trace"],
    url: values.url,
    viewport: {
      height: Number(values.height),
      scale: Number(values.scale),
      width: Number(values.width),
    },
    worst: Number(values.worst),
  };
};
