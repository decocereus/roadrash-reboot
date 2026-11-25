import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

import * as NodeFileSystem from "@effect/platform-node/NodeFileSystem";
import { profileFor } from "@racer/devtools/claim";
import { ToolProcesses } from "@racer/devtools/process";
import * as Effect from "effect/Effect";
import * as Exit from "effect/Exit";
import * as Layer from "effect/Layer";
import { afterEach, describe, expect, it } from "vitest";

import { assertParked, psSeconds, RV, statTicks } from "../src/gpu-rv.ts";
import type { ParkTiming } from "../src/gpu-rv.ts";

const IDLE = "20261125-093932-s0";
const OTHER = "20261125-093936-s1";
const roots: string[] = [];

const renderer = (run: string) =>
  `/Applications/Helium.app/Contents/Frameworks/Helium Helper (Renderer) --type=renderer --user-data-dir=${profileFor(run)} --lang=en`;

const LISTED = [
  { command: renderer(IDLE), pid: 101 },
  { command: renderer(OTHER), pid: 202 },
  {
    command: `/usr/lib/chromium/chromium --type=gpu-process --user-data-dir=${profileFor(IDLE)}`,
    pid: 303,
  },
];

interface Bench {
  readonly pages: readonly string[];
  readonly times: readonly string[];
}

const benchOf = (bench: Bench) => {
  const calls = { js: 0, ps: 0 };
  return Layer.succeed(ToolProcesses)({
    commandOf: () => Effect.succeed(""),
    listed: Effect.succeed(LISTED),
    listenerOf: () => Effect.succeed(null),
    run: (file, args) =>
      Effect.sync(() => {
        if (file === "getconf") {
          return { stderr: "", stdout: "100\n" };
        }
        if (file === "ps") {
          const time = bench.times[Math.min(calls.ps, bench.times.length - 1)];
          calls.ps += 1;
          return {
            stderr: "",
            stdout: `  101 ${time ?? "0:00.00"}\n  202 9:00.00\n  303 9:00.00\n`,
          };
        }
        if (args[0] === RV && args[1] === "js" && args[3] === IDLE) {
          const page = bench.pages[Math.min(calls.js, bench.pages.length - 1)];
          calls.js += 1;
          return { stderr: "", stdout: JSON.stringify(page) };
        }
        return { stderr: "", stdout: "" };
      }),
    runShown: () => Effect.die("the park check runs no shown command"),
    spawnScoped: () => Effect.die("the park check spawns nothing"),
    startDetached: () => Effect.die("the park check starts nothing"),
    stopOwned: () => Effect.die("the park check stops nothing"),
  });
};

const TIMING: ParkTiming = {
  gapMs: 1,
  procRoot: "/proc",
  sampleMs: 10,
  tries: 3,
};

const parked = async (
  bench: Bench,
  platform: NodeJS.Platform,
  timing: ParkTiming = TIMING
) =>
  await Effect.runPromiseExit(
    assertParked(IDLE, platform, timing).pipe(
      Effect.provide(Layer.mergeAll(benchOf(bench), NodeFileSystem.layer))
    )
  );

const failure = (exit: Exit.Exit<number, unknown>): string =>
  Exit.isFailure(exit) ? String(exit.cause) : "passed";

describe("the idle slot's park check", () => {
  afterEach(() => {
    for (const root of roots.splice(0)) {
      rmSync(root, { force: true, recursive: true });
    }
  });

  it("passes at once when the idle page sits on /kit and its renderers are quiet", async () => {
    const exit = await parked(
      { pages: ["/kit"], times: ["0:01.00"] },
      "darwin"
    );
    expect(Exit.isSuccess(exit) && exit.value).toBe(1);
  });

  it("waits for a renderer still tearing down the race it left", async () => {
    const exit = await parked(
      {
        pages: ["/kit"],
        times: ["0:01.00", "0:01.50", "0:01.50", "0:01.50"],
      },
      "darwin"
    );
    expect(Exit.isSuccess(exit) && exit.value).toBe(2);
  });

  it("refuses a slot that stays busy, naming the slot and the busy renderer", async () => {
    const exit = await parked(
      {
        pages: ["/kit"],
        times: [
          "0:01.00",
          "0:01.50",
          "0:02.00",
          "0:02.50",
          "0:03.00",
          "0:03.50",
        ],
      },
      "darwin"
    );
    expect(failure(exit)).toContain(
      `The idle run ${IDLE} in slot 0 is not parked on /kit after 3 tries 0.001 s apart (page "/kit", busy renderers pid 101 at 5000% of a core)`
    );
  });

  it("refuses an idle page that left /kit, though its renderers are quiet", async () => {
    const exit = await parked(
      { pages: ["/?stress"], times: ["0:01.00"] },
      "darwin"
    );
    expect(failure(exit)).toContain('(page "/?stress")');
  });

  it("reads renderer time from /proc on Linux", async () => {
    const root = mkdtempSync(path.join(tmpdir(), "rushline-proc-"));
    roots.push(root);
    mkdirSync(path.join(root, "101"));
    writeFileSync(
      path.join(root, "101", "stat"),
      "101 (chromium (x)) S 1 1 1 0 -1 4194560 100 0 0 0 250 50 0 0 20 0 1 0 1\n"
    );
    const exit = await parked(
      { pages: ["/kit"], times: ["9:00.00"] },
      "linux",
      {
        ...TIMING,
        procRoot: root,
      }
    );
    expect(Exit.isSuccess(exit) && exit.value).toBe(1);
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
