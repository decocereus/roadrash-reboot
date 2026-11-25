import {
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

import * as NodeFileSystem from "@effect/platform-node/NodeFileSystem";
import { browserHosts } from "@racer/devtools/browser-host";
import * as Effect from "effect/Effect";
import * as Exit from "effect/Exit";
import type * as FileSystem from "effect/FileSystem";
import * as Schema from "effect/Schema";
import { afterEach, describe, expect, it } from "vitest";

import { budgetsFile } from "../src/budgets.ts";
import type { BarSample } from "../src/gpu-bar.ts";
import {
  clockOfCapture,
  probeClock,
  sourceText,
  whileSampling,
  windowClockOf,
} from "../src/gpu-clock.ts";
import type {
  ClockReading,
  ClockSource,
  WindowClock,
} from "../src/gpu-clock.ts";
import { evaluateGpu } from "../src/gpu-frames.ts";
import type { GpuSample } from "../src/gpu-frames.ts";
import { clockStatesOf } from "../src/gpu-states.ts";
import {
  campaign,
  QUIET,
  SLOT,
  START_MS,
  steady,
  steadyBar,
} from "./gpu-fixture.ts";

const { limits } = Schema.decodeUnknownSync(Schema.fromJsonString(budgetsFile))(
  readFileSync(path.join(import.meta.dirname, "../budgets.json"), "utf-8")
);

const METAL = browserHosts["macos-metal"].perfEnvironment;

const roots: string[] = [];

const write = (root: string, file: string, text: string) => {
  mkdirSync(path.dirname(path.join(root, file)), { recursive: true });
  writeFileSync(path.join(root, file), text);
};

const sysfs = (kilohertz: string) => {
  const root = mkdtempSync(path.join(tmpdir(), "rushline-sysfs-"));
  roots.push(root);
  for (const core of ["cpu0", "cpu1"]) {
    write(
      root,
      `devices/system/cpu/${core}/cpufreq/scaling_cur_freq`,
      kilohertz
    );
    write(
      root,
      `devices/system/cpu/${core}/cpufreq/cpuinfo_max_freq`,
      "4500000\n"
    );
  }
  write(root, "devices/system/cpu/cpufreq/policy0/scaling_cur_freq", "1\n");
  write(root, "class/thermal/thermal_zone0/type", "acpitz\n");
  write(root, "class/thermal/thermal_zone0/temp", "40000\n");
  write(root, "class/thermal/thermal_zone1/type", "x86_pkg_temp\n");
  write(root, "class/thermal/thermal_zone1/temp", "84000\n");
  return root;
};

const onDisk = async <A, E>(
  effect: Effect.Effect<A, E, FileSystem.FileSystem>
) =>
  await Effect.runPromiseExit(
    effect.pipe(Effect.provide(NodeFileSystem.layer))
  );

const probed = async (root: string): Promise<ClockSource> => {
  const exit = await onDisk(probeClock(root));
  if (Exit.isFailure(exit)) {
    throw new Error(`probe failed: ${String(exit.cause)}`);
  }
  return exit.value;
};

const reading = (at: number, mhz: number, packageC = 80): ClockReading => ({
  at,
  mhz,
  packageC,
});

const span = { from: 1000, to: 5000 };

const withShare = (slow: number) =>
  Array.from({ length: 5 }, (_, index) =>
    reading(1000 + index * 1000, index < slow ? 2100 : 3700)
  );

const stateIn = (clock: WindowClock): string =>
  clock.kind === "read" ? clock.state : "unread";

const cpufreq: ClockSource = {
  cores: ["cpu0"],
  kind: "cpufreq",
  maxMhz: 4500,
  packageTemp: null,
};

describe("the CPU clock beside each GPU window", () => {
  afterEach(() => {
    for (const root of roots.splice(0)) {
      rmSync(root, { force: true, recursive: true });
    }
  });

  it("probes the cores, the top clock and the package zone of a cpufreq host", async () => {
    const root = sysfs("3600000\n");
    await expect(probed(root)).resolves.toStrictEqual({
      cores: ["cpu0", "cpu1"].map((core) =>
        path.join(root, `devices/system/cpu/${core}/cpufreq/scaling_cur_freq`)
      ),
      kind: "cpufreq",
      maxMhz: 4500,
      packageTemp: path.join(root, "class/thermal/thermal_zone1/temp"),
    });
  });

  it("records nothing on a host without cpufreq, and says why", async () => {
    const root = mkdtempSync(path.join(tmpdir(), "rushline-sysfs-"));
    roots.push(root);
    const source = await probed(root);
    expect(source.kind).toBe("absent");
    expect(sourceText(source)).toBe(
      `info clock not recorded: no ${root}/devices/system/cpu/cpu*/cpufreq/scaling_cur_freq on this host, so no window has a clock state`
    );
  });

  it("tags a window fast at a slow share of 0.2, slow at 0.8 and mixed between", () => {
    expect(stateIn(windowClockOf(withShare(1), span, 4500))).toBe("fast");
    expect(stateIn(windowClockOf(withShare(2), span, 4500))).toBe("mixed");
    expect(stateIn(windowClockOf(withShare(3), span, 4500))).toBe("mixed");
    expect(stateIn(windowClockOf(withShare(4), span, 4500))).toBe("slow");
  });

  it("reads only the window's own seconds, with its mean clock and package heat", () => {
    const readings = [
      reading(0, 2000, 70),
      reading(1000, 3600, 80),
      reading(3000, 3800, 90),
      reading(6000, 2000, 70),
    ];
    expect(windowClockOf(readings, span, 4500)).toStrictEqual({
      kind: "read",
      meanMhz: 3700,
      packageC: { max: 90, mean: 85 },
      readings: 2,
      slowShare: 0,
      state: "fast",
    });
    expect(
      windowClockOf(readings, { from: 7000, to: 8000 }, 4500)
    ).toStrictEqual({
      kind: "unread",
      reason: "no clock reading fell inside the window",
    });
  });

  it("places host readings on the page's frames through its time origin", () => {
    const [sample] = campaign(() => steady);
    const frames = sample?.capture.frames ?? [];
    const timeOrigin = 1_764_045_000_000.25;
    const first = timeOrigin + START_MS;
    const last = first + (frames.length - 1) * SLOT + 16.7;
    const readings = [
      reading(first - 400, 2100),
      reading(first + 100, 3700),
      reading(first + 1100, 3700),
      reading(first + 2100, 3700),
      reading(last - 1100, 2100),
      reading(last - 100, 2100),
      reading(last + 400, 2100),
    ];
    const sampled = { failure: null, readings };
    expect(
      clockOfCapture(cpufreq, sampled, { frames, timeOrigin })
    ).toStrictEqual({
      kind: "read",
      meanMhz: 3060,
      packageC: { max: 80, mean: 80 },
      readings: 5,
      slowShare: 0.4,
      state: "mixed",
    });
    expect(
      clockOfCapture(
        cpufreq,
        { failure: "cpu3 went offline", readings },
        { frames, timeOrigin }
      )
    ).toStrictEqual({
      kind: "unread",
      reason: "clock read failed: cpu3 went offline",
    });
    expect(
      clockOfCapture({ kind: "absent", reason: "no cpufreq" }, sampled, {
        frames,
        timeOrigin,
      })
    ).toBeNull();
  });

  it("samples once a second while the window runs", async () => {
    const source = await probed(sysfs("2100000\n"));
    const exit = await onDisk(
      whileSampling(source, Effect.sleep("1500 millis"))
    );
    expect(
      Exit.isSuccess(exit) &&
        exit.value.sampled.readings.map(({ mhz, packageC }) => ({
          mhz,
          packageC,
        }))
    ).toStrictEqual([
      { mhz: 2100, packageC: 84 },
      { mhz: 2100, packageC: 84 },
    ]);
  });

  it("keeps the window when a clock read fails, and records why", async () => {
    const root = sysfs("not a clock\n");
    const source: ClockSource = {
      cores: [
        path.join(root, "devices/system/cpu/cpu0/cpufreq/scaling_cur_freq"),
      ],
      kind: "cpufreq",
      maxMhz: 4500,
      packageTemp: null,
    };
    const exit = await onDisk(
      whileSampling(
        source,
        Effect.sleep("50 millis").pipe(Effect.as("the capture"))
      )
    );
    expect(Exit.isSuccess(exit) && exit.value.result).toBe("the capture");
    expect(Exit.isSuccess(exit) && exit.value.sampled.failure).toContain(
      'reads "not a clock", not a number'
    );
  });
});

const read = (state: "fast" | "mixed" | "slow"): WindowClock => ({
  kind: "read",
  meanMhz: state === "slow" ? 2150 : 3700,
  packageC: null,
  readings: 30,
  slowShare: { fast: 0, mixed: 0.5, slow: 1 }[state],
  state,
});

const stateAt = (sample: GpuSample): "fast" | "slow" =>
  sample.pair === 4 || (sample.pair === 3 && sample.side === "B")
    ? "slow"
    : "fast";

const clocked = (samples: readonly GpuSample[]): GpuSample[] =>
  samples.map((sample) => ({ ...sample, clock: read(stateAt(sample)) }));

const slowAtPairThree = clocked(
  campaign((_scenario, side, pair) =>
    side === "B" && pair === 3 ? { ...steady, interval: () => 33.4 } : steady
  )
);

const VARIED: readonly (WindowClock | null)[] = [
  read("fast"),
  read("slow"),
  read("mixed"),
  { kind: "unread", reason: "clock read failed: cpu0" },
  null,
];

const varied = <T extends { readonly clock: WindowClock | null }>(
  windows: readonly T[]
): T[] =>
  windows.map((each, index) => ({
    ...each,
    clock: VARIED[index % VARIED.length] ?? null,
  }));

const unclocked = <T extends { readonly clock: WindowClock | null }>(
  windows: readonly T[]
): T[] => windows.map((each) => ({ ...each, clock: null }));

const judgedWith = (samples: readonly GpuSample[], bar: readonly BarSample[]) =>
  evaluateGpu(samples, bar, limits, METAL, null);

describe("the per-state table beside the verdict", () => {
  it("counts windows by state and pairs only windows of one state", () => {
    const { lines } = clockStatesOf(cpufreq, slowAtPairThree, steadyBar);
    expect(lines).toContain(
      "info clock reference-v1 windows A fast 4 slow 1 mixed 0 unread 0; B fast 3 slow 2 mixed 0 unread 0 (information only, not judged)"
    );
    expect(lines).toContain(
      "info clock reference-v1 fast-state pairs 3 of 5: p50 B/A 1.000, p95 B/A 1.000, p99 B/A 1.000, missed B-A pp +0.00, riders p95 B/A 1.000 (information only, not judged)"
    );
    expect(lines).toContain(
      "info clock reference-v1 slow-state pairs 1 of 5: p50 B/A 1.000, p95 B/A 1.000, p99 B/A 1.000, missed B-A pp +0.00, riders p95 B/A 1.000 (information only, not judged)"
    );
    expect(lines).toContain(
      "info clock bar side=B fast 0 slow 0 mixed 0 unread 5 (information only, not judged)"
    );
    expect(lines.at(-1)).toMatch(
      /^info clock by position after warm-up: 0 reference-v1 A fast, 1 reference-v1 B fast, .*, 7 reference-v1 B slow, 8 reference-v1 A slow, 9 reference-v1 B slow, 10 pack-riding-v1 A fast, .*, 20 bar B unread, .*, 24 bar B unread \(information only, not judged\)$/u
    );
  });

  it("leaves a window whose idle slot was not proved quiet out of the pairs, and flags it", () => {
    const busy = slowAtPairThree.map((sample, index) =>
      index === 1
        ? {
            ...sample,
            park: {
              ...QUIET,
              renderers: [{ pid: 101, share: 0.4 }],
              state: "busy" as const,
            },
          }
        : sample
    );
    const { lines } = clockStatesOf(cpufreq, busy, steadyBar);
    expect(lines).toContainEqual(
      expect.stringMatching(/^info clock reference-v1 fast-state pairs 2 of 5/u)
    );
    expect(lines.at(-1)).toContain("1 reference-v1 B fast idle busy,");
  });

  it("says how many windows went unread and why", () => {
    const unread = slowAtPairThree.map((sample, index) =>
      index === 3 || index === 6
        ? {
            ...sample,
            clock: { kind: "unread" as const, reason: "clock read failed: x" },
          }
        : sample
    );
    expect(clockStatesOf(cpufreq, unread, steadyBar).lines).toContain(
      "info clock unread 2 of 25 windows: clock read failed: x at positions 3 6 (information only, not judged)"
    );
  });

  it("prints and stores a ratio over a zero baseline as unavailable", () => {
    const idleRiders = clocked(
      campaign(() => ({ ...steady, riders: () => 0 }))
    );
    const { lines, states } = clockStatesOf(cpufreq, idleRiders, steadyBar);
    expect(lines).toContainEqual(
      expect.stringContaining("riders p95 B/A unavailable")
    );
    expect(states[0]?.paired[0]?.rows.at(-1)?.value).toBe("unavailable");
  });

  it("prints nothing per state on a host without cpufreq", () => {
    expect(
      clockStatesOf(
        { kind: "absent", reason: "no cpufreq" },
        slowAtPairThree,
        steadyBar
      )
    ).toStrictEqual({ lines: [], order: [], states: [] });
  });

  it("leaves today's verdict exactly as it was, passing or failing, whatever the clocks read", () => {
    const passing = campaign(() => steady);
    const failingRun = campaign((_scenario, side) =>
      side === "B" ? { ...steady, interval: () => 25 } : steady
    );
    const quietBar = steadyBar.map((sample) => ({
      ...sample,
      clock: read("fast"),
    }));
    const plain = judgedWith(unclocked(passing), unclocked(quietBar));
    expect(plain.ok).toBeTruthy();
    expect(judgedWith(varied(passing), varied(quietBar))).toStrictEqual(plain);
    const red = judgedWith(unclocked(failingRun), unclocked(quietBar));
    expect(red.ok).toBeFalsy();
    expect(judgedWith(varied(failingRun), varied(quietBar))).toStrictEqual(red);
  });
});
