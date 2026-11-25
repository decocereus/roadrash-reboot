import {
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { setTimeout as delay } from "node:timers/promises";

import * as NodeFileSystem from "@effect/platform-node/NodeFileSystem";
import { browserHosts } from "@racer/devtools/browser-host";
import { profileFor } from "@racer/devtools/claim";
import { ToolProcesses } from "@racer/devtools/process";
import * as Clock from "effect/Clock";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import * as Schema from "effect/Schema";
import { afterEach, describe, expect, it } from "vitest";

import { budgetsFile } from "../src/budgets.ts";
import type { ClockSource } from "../src/gpu-clock.ts";
import { evaluateGpu } from "../src/gpu-frames.ts";
import type { GpuSample } from "../src/gpu-frames.ts";
import { RV } from "../src/gpu-rv.ts";
import { sampleOnce } from "../src/gpu-sample.ts";
import { scenarios } from "../src/scenarios.ts";
import { campaign, scriptedClock, steady, steadyBar } from "./gpu-fixture.ts";

const IDLE = "20261125-110000-s0";
const MEASURED = "20261125-110004-s1";
const roots: string[] = [];

const { limits } = Schema.decodeUnknownSync(Schema.fromJsonString(budgetsFile))(
  readFileSync(path.join(import.meta.dirname, "../budgets.json"), "utf-8")
);

const METAL = browserHosts["macos-metal"].perfEnvironment;

const [reference] = scenarios;

const sideA = campaign(() => steady).find((sample) => sample.side === "A");

const tempDir = (prefix: string) => {
  const root = mkdtempSync(path.join(tmpdir(), prefix));
  roots.push(root);
  return root;
};

interface Observed {
  readonly busyIdle: boolean;
  readonly source: ClockSource;
}

const output = (stdout: string) => ({ stderr: "", stdout });

const benchOf = ({ busyIdle }: Observed, captureText: string) => {
  const calls = { ps: 0 };
  return Layer.succeed(ToolProcesses)({
    commandOf: () => Effect.succeed(""),
    listed: Effect.succeed([
      {
        command: `Helium Helper (Renderer) --type=renderer --user-data-dir=${profileFor(IDLE)}`,
        pid: 101,
      },
    ]),
    listenerOf: () => Effect.succeed(null),
    run: (file, args) => {
      if (file === "ps") {
        return Effect.sync(() => {
          const seconds = busyIdle ? 1 + calls.ps * 0.5 : 1;
          calls.ps += 1;
          return output(`  101 0:${seconds.toFixed(2)}\n`);
        });
      }
      const [script, verb, , run, code = ""] = args;
      if (script !== RV) {
        return Effect.succeed(output(""));
      }
      if (verb === "wait") {
        return Effect.promise(async () => {
          await delay(50);
          return output("");
        });
      }
      if (verb === "console") {
        return Effect.succeed(output("0 lines from console.jsonl"));
      }
      if (verb === "js" && run === IDLE) {
        return Effect.succeed(output('"/kit"'));
      }
      if (verb === "js" && code.includes("takeRecords")) {
        return Effect.succeed(output(captureText));
      }
      if (verb === "js") {
        return Effect.succeed(
          output(JSON.stringify({ tick: 0, visibility: "visible" }))
        );
      }
      return Effect.succeed(output(""));
    },
    runShown: () => Effect.die("sampling runs no shown command"),
    spawnScoped: () => Effect.die("sampling spawns nothing"),
    startDetached: () => Effect.die("sampling starts nothing"),
    stopOwned: () => Effect.die("sampling stops nothing"),
  });
};

const sampled = async (observed: Observed, captureText: string) => {
  const dir = tempDir("rushline-gpu-observe-");
  mkdirSync(path.join(dir, "gpu"));
  const { clock } = scriptedClock();
  if (reference === undefined) {
    throw new Error("no reference scenario");
  }
  const sample = await Effect.runPromise(
    sampleOnce(
      { dir, host: { platform: "darwin" }, source: observed.source },
      { idle: IDLE, measured: MEASURED },
      { pair: 0, position: 0, side: "A" },
      reference
    ).pipe(
      Effect.provide(
        Layer.mergeAll(benchOf(observed, captureText), NodeFileSystem.layer)
      ),
      Effect.provideService(Clock.Clock, clock)
    )
  );
  const written = readFileSync(path.join(dir, "gpu", sample.file), "utf-8");
  return { sample, written };
};

const failingClock = (): ClockSource => {
  const root = tempDir("rushline-sysfs-");
  const core = path.join(root, "scaling_cur_freq");
  writeFileSync(core, "not a clock\n");
  return { cores: [core], kind: "cpufreq", maxMhz: 4500, packageTemp: null };
};

const withoutObservations = ({
  clock: _clock,
  park: _park,
  ...rest
}: GpuSample) => rest;

describe("observations beside a campaign", () => {
  afterEach(() => {
    for (const root of roots.splice(0)) {
      rmSync(root, { force: true, recursive: true });
    }
  });

  it("leave the captures and the verdict as they are when the clock read fails and the idle slot stays busy", async () => {
    if (sideA === undefined) {
      throw new Error("the fixture campaign has no side A");
    }
    const captureText = JSON.stringify(sideA.capture);
    const plain = await sampled(
      { busyIdle: false, source: { kind: "absent", reason: "test" } },
      captureText
    );
    const source = failingClock();
    const [badCore = ""] = source.kind === "cpufreq" ? source.cores : [];
    const observed = await sampled({ busyIdle: true, source }, captureText);

    expect([observed.written, plain.written]).toStrictEqual([
      captureText,
      captureText,
    ]);
    expect(withoutObservations(observed.sample)).toStrictEqual(
      withoutObservations(plain.sample)
    );
    expect({
      observed: [observed.sample.clock, observed.sample.park.state],
      plain: [plain.sample.clock, plain.sample.park.state],
    }).toStrictEqual({
      observed: [
        {
          kind: "unread",
          reason: `clock read failed: ${badCore} reads "not a clock", not a number`,
        },
        "busy",
      ],
      plain: [null, "quiet"],
    });

    const asObserved = <T extends Pick<GpuSample, "clock" | "park">>(
      sample: T
    ): T => ({
      ...sample,
      clock: observed.sample.clock,
      park: observed.sample.park,
    });
    const passing = campaign(() => steady);
    const failingRun = campaign((_scenario, side) =>
      side === "B" ? { ...steady, interval: () => 25 } : steady
    );
    for (const run of [passing, failingRun]) {
      expect(
        evaluateGpu(
          run.map(asObserved),
          steadyBar.map(asObserved),
          limits,
          METAL,
          null
        )
      ).toStrictEqual(evaluateGpu(run, steadyBar, limits, METAL, null));
    }
  });
});
