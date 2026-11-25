import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

import * as NodeFileSystem from "@effect/platform-node/NodeFileSystem";
import * as Effect from "effect/Effect";
import * as Exit from "effect/Exit";
import type * as FileSystem from "effect/FileSystem";
import { afterEach, describe, expect, it } from "vitest";

import {
  probeClock,
  sourceText,
  whileSampling,
  windowClockOf,
} from "../src/gpu-clock.ts";
import type { ClockReading, ClockSource } from "../src/gpu-clock.ts";
import { evaluateGpu } from "../src/gpu-frames.ts";
import type { GpuSample } from "../src/gpu-frames.ts";
import { clockStatesOf } from "../src/gpu-states.ts";
import { campaign, steady, steadyBar } from "./gpu-fixture.ts";

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
    expect(windowClockOf(withShare(1), span, 4500)?.state).toBe("fast");
    expect(windowClockOf(withShare(2), span, 4500)?.state).toBe("mixed");
    expect(windowClockOf(withShare(3), span, 4500)?.state).toBe("mixed");
    expect(windowClockOf(withShare(4), span, 4500)?.state).toBe("slow");
  });

  it("reads only the window's own seconds, with its mean clock and package heat", () => {
    const readings = [
      reading(0, 2000, 70),
      reading(1000, 3600, 80),
      reading(3000, 3800, 90),
      reading(6000, 2000, 70),
    ];
    expect(windowClockOf(readings, span, 4500)).toStrictEqual({
      meanMhz: 3700,
      packageC: { max: 90, mean: 85 },
      readings: 2,
      slowShare: 0,
      state: "fast",
    });
    expect(windowClockOf(readings, { from: 7000, to: 8000 }, 4500)).toBeNull();
  });

  it("samples once a second while the window runs", async () => {
    const source = await probed(sysfs("2100000\n"));
    const exit = await onDisk(
      whileSampling(source, Effect.sleep("1500 millis"))
    );
    expect(Exit.isSuccess(exit) && exit.value.readings.length).toBe(2);
    expect(
      Exit.isSuccess(exit) &&
        exit.value.readings.map(({ mhz, packageC }) => ({ mhz, packageC }))
    ).toStrictEqual([
      { mhz: 2100, packageC: 84 },
      { mhz: 2100, packageC: 84 },
    ]);
  });

  it("fails the window when a clock read fails, instead of tagging it on fewer seconds", async () => {
    const root = sysfs("not a clock\n");
    const source: ClockSource = {
      cores: [
        path.join(root, "devices/system/cpu/cpu0/cpufreq/scaling_cur_freq"),
      ],
      kind: "cpufreq",
      maxMhz: 4500,
      packageTemp: null,
    };
    const exit = await onDisk(whileSampling(source, Effect.sleep("50 millis")));
    expect(Exit.isFailure(exit) && String(exit.cause)).toContain(
      'reads "not a clock", not a number'
    );
  });
});

const CLOCKS = {
  fast: { meanMhz: 3700, packageC: null, readings: 30, slowShare: 0 },
  slow: { meanMhz: 2150, packageC: null, readings: 30, slowShare: 1 },
} as const;

const stateAt = (sample: GpuSample): keyof typeof CLOCKS => {
  if (sample.pair === 4 || (sample.pair === 3 && sample.side === "B")) {
    return "slow";
  }
  return "fast";
};

const clocked = (samples: readonly GpuSample[]): GpuSample[] =>
  samples.map((sample) => ({
    ...sample,
    clock: { ...CLOCKS[stateAt(sample)], state: stateAt(sample) },
  }));

const slowAtPairThree = clocked(
  campaign((_scenario, side, pair) =>
    side === "B" && pair === 3 ? { ...steady, interval: () => 33.4 } : steady
  )
);

const cpufreq: ClockSource = {
  cores: ["cpu0"],
  kind: "cpufreq",
  maxMhz: 4500,
  packageTemp: null,
};

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

  it("prints nothing per state on a host without cpufreq", () => {
    expect(
      clockStatesOf(
        { kind: "absent", reason: "no cpufreq" },
        slowAtPairThree,
        steadyBar
      )
    ).toStrictEqual({ lines: [], order: [], states: [] });
  });

  it("leaves today's verdict lines exactly as they were", () => {
    const unclocked = slowAtPairThree.map((sample) => ({
      ...sample,
      clock: null,
    }));
    expect(
      evaluateGpu(slowAtPairThree, steadyBar, [], "gpu-chromium-intel", null)
    ).toStrictEqual(
      evaluateGpu(unclocked, steadyBar, [], "gpu-chromium-intel", null)
    );
  });
});
