import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

import * as NodeFileSystem from "@effect/platform-node/NodeFileSystem";
import { profileFor } from "@racer/devtools/claim";
import { ToolProcesses } from "@racer/devtools/process";
import { ProcessError } from "@racer/devtools/process-error";
import * as Clock from "effect/Clock";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import { afterEach, describe, expect, it } from "vitest";

import { parkText, psSeconds, readPark, RV, statTicks } from "../src/gpu-rv.ts";
import type { ParkReading, ParkTiming } from "../src/gpu-rv.ts";
import { scriptedClock } from "./gpu-fixture.ts";

const IDLE = "20261125-093932-s0";
const OTHER = "20261125-093936-s1";
const roots: string[] = [];

const renderer = (run: string, pid: number) => ({
  command: `/Applications/Helium.app/Contents/Frameworks/Helium Helper (Renderer) --type=renderer --user-data-dir=${profileFor(run)} --lang=en`,
  pid,
});

const OTHERS = [
  renderer(OTHER, 202),
  {
    command: `/usr/lib/chromium/chromium --type=gpu-process --user-data-dir=${profileFor(IDLE)}`,
    pid: 303,
  },
];

interface Bench {
  readonly delayMs?: readonly number[];
  readonly failPs?: boolean;
  readonly listings?: readonly (readonly number[])[];
  readonly pages: readonly string[];
  readonly times: readonly string[];
}

const at = <T>(list: readonly T[], index: number): T | undefined =>
  list[Math.min(index, list.length - 1)];

const benchOf = (bench: Bench, advance: (ms: number) => void) => {
  const calls = { js: 0, listed: 0, ps: 0 };
  return Layer.succeed(ToolProcesses)({
    commandOf: () => Effect.succeed(""),
    listed: Effect.sync(() => {
      const pids = at(bench.listings ?? [[101]], calls.listed) ?? [];
      calls.listed += 1;
      return [...pids.map((pid) => renderer(IDLE, pid)), ...OTHERS];
    }),
    listenerOf: () => Effect.succeed(null),
    run: (file, args) => {
      if (file === "ps" && bench.failPs === true) {
        return Effect.fail(
          new ProcessError({
            executable: "ps",
            message: "ps: not permitted",
            operation: "run",
          })
        );
      }
      return Effect.sync(() => {
        if (file === "getconf") {
          return { stderr: "", stdout: "100\n" };
        }
        if (file === "ps") {
          advance(at(bench.delayMs ?? [0], calls.ps) ?? 0);
          const time = at(bench.times, calls.ps) ?? "0:00.00";
          calls.ps += 1;
          return {
            stderr: "",
            stdout: `  101 ${time}\n  102 ${time}\n  202 9:00.00\n  303 9:00.00\n`,
          };
        }
        if (args[0] === RV && args[1] === "js" && args[3] === IDLE) {
          const page = at(bench.pages, calls.js) ?? "";
          calls.js += 1;
          return { stderr: "", stdout: JSON.stringify(page) };
        }
        return { stderr: "", stdout: "" };
      });
    },
    runShown: () => Effect.die("the park check runs no shown command"),
    spawnScoped: () => Effect.die("the park check spawns nothing"),
    startDetached: () => Effect.die("the park check starts nothing"),
    stopOwned: () => Effect.die("the park check stops nothing"),
  });
};

const TIMING: ParkTiming = {
  gapMs: 2000,
  procRoot: "/proc",
  sampleMs: 2000,
  tries: 3,
};

const parked = async (
  bench: Bench,
  platform: NodeJS.Platform = "darwin",
  timing: ParkTiming = TIMING
): Promise<ParkReading> => {
  const { advance, clock } = scriptedClock();
  return await Effect.runPromise(
    readPark(IDLE, platform, timing).pipe(
      Effect.provide(
        Layer.mergeAll(benchOf(bench, advance), NodeFileSystem.layer)
      ),
      Effect.provideService(Clock.Clock, clock)
    )
  );
};

const secondReadLate = async (burnedPerRead: number): Promise<ParkReading> =>
  await parked({
    delayMs: [0, 2000, 0, 2000, 0, 2000],
    pages: ["/kit"],
    times: Array.from(
      { length: 6 },
      (_, index) => `0:${(10 + index * burnedPerRead).toFixed(2)}`
    ),
  });

describe("the idle slot's park reading", () => {
  afterEach(() => {
    for (const root of roots.splice(0)) {
      rmSync(root, { force: true, recursive: true });
    }
  });

  it("reads quiet at once when the idle page sits on /kit and its renderers rest", async () => {
    await expect(
      parked({ pages: ["/kit"], times: ["0:01.00"] })
    ).resolves.toMatchObject({ state: "quiet", tries: 1 });
  });

  it("waits for a renderer still tearing down the race it left", async () => {
    await expect(
      parked({
        pages: ["/kit"],
        times: ["0:01.00", "0:01.50", "0:01.50", "0:01.50"],
      })
    ).resolves.toMatchObject({ state: "quiet", tries: 2 });
  });

  it("records a slot that stays busy with its run, slot, pid and load, and carries on", async () => {
    const park = await parked({
      pages: ["/kit"],
      times: ["0:01.00", "0:01.50", "0:02.00", "0:02.50", "0:03.00", "0:03.50"],
    });
    expect(park).toStrictEqual({
      page: '"/kit"',
      reason: null,
      renderers: [{ pid: 101, share: 0.25 }],
      run: IDLE,
      slot: "0",
      state: "busy",
      tries: 3,
    });
    expect(parkText(park)).toBe(
      `idle run ${IDLE} in slot 0 not proved parked after 3 park checks: page "/kit", busy pid 101 at 25% of a core`
    );
  });

  it("records an idle page that left /kit as busy", async () => {
    await expect(
      parked({ pages: ["/?stress"], times: ["0:01.00"] })
    ).resolves.toMatchObject({ page: '"/?stress"', state: "busy" });
  });

  it("divides by the time that passed between the reads, not the sleep it asked for", async () => {
    await expect(secondReadLate(0.19)).resolves.toMatchObject({
      state: "quiet",
      tries: 1,
    });
    const busy = await secondReadLate(0.21);
    expect(busy).toMatchObject({ state: "busy", tries: 3 });
    expect(busy.renderers.map(({ pid }) => pid)).toStrictEqual([101]);
    expect(busy.renderers[0]?.share).toBeCloseTo(0.0525, 6);
  });

  it("records unknown when no renderer of the idle run is found", async () => {
    await expect(
      parked({ listings: [[]], pages: ["/kit"], times: ["0:01.00"] })
    ).resolves.toMatchObject({
      reason: `no renderer of ${IDLE} was found`,
      state: "unknown",
      tries: 3,
    });
  });

  it("does not take a renderer that changed during the sample as quiet", async () => {
    await expect(
      parked({
        listings: [[101], [102], [101], [102], [101], [102]],
        pages: ["/kit"],
        times: ["0:01.00"],
      })
    ).resolves.toMatchObject({
      reason: `the renderers of ${IDLE} changed during the sample`,
      state: "unknown",
    });
  });

  it("records unknown when the CPU time cannot be read, instead of ending the campaign", async () => {
    const park = await parked({
      failPs: true,
      pages: ["/kit"],
      times: ["0:01.00"],
    });
    expect(park.state).toBe("unknown");
    expect(park.reason).toContain("ps: not permitted");
  });

  it("reads renderer time from /proc on Linux", async () => {
    const root = mkdtempSync(path.join(tmpdir(), "rushline-proc-"));
    roots.push(root);
    mkdirSync(path.join(root, "101"));
    writeFileSync(
      path.join(root, "101", "stat"),
      "101 (chromium (x)) S 1 1 1 0 -1 4194560 100 0 0 0 250 50 0 0 20 0 1 0 1\n"
    );
    await expect(
      parked({ pages: ["/kit"], times: ["9:00.00"] }, "linux", {
        ...TIMING,
        procRoot: root,
      })
    ).resolves.toMatchObject({ state: "quiet", tries: 1 });
  });

  it("reads user and system ticks past a name with spaces and brackets", () => {
    expect(
      statTicks(
        "101 (Web Content (x)) S 1 1 1 0 -1 4194560 100 0 0 0 250 50 0 0 20\n"
      )
    ).toBe(300);
  });

  it("reads ps cpu time in minutes and seconds", () => {
    expect(psSeconds("1:48.40")).toBeCloseTo(108.4);
    expect(psSeconds("61:02.05")).toBeCloseTo(3662.05);
  });
});
