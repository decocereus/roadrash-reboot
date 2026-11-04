import {
  mkdtempSync,
  readFileSync,
  readdirSync,
  rmSync,
  writeFileSync,
  existsSync,
} from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

import * as NodeFileSystem from "@effect/platform-node/NodeFileSystem";
import {
  benchChildEnv,
  holdBench,
  refuseDuringBench,
} from "@racer/devtools/bench-lock";
import { CleanupOutcomes } from "@racer/devtools/cleanup";
import * as Cause from "effect/Cause";
import * as Effect from "effect/Effect";
import * as Exit from "effect/Exit";
import type * as FileSystem from "effect/FileSystem";
import * as Ref from "effect/Ref";
import type * as Scope from "effect/Scope";
import { afterEach, describe, expect, it, vi } from "vitest";

const dirs: string[] = [];

const freshDir = () => {
  const dir = mkdtempSync(path.join(tmpdir(), "rushline-bench-lock-test-"));
  dirs.push(dir);
  return dir;
};

const run = async <A, E>(
  effect: Effect.Effect<
    A,
    E,
    FileSystem.FileSystem | CleanupOutcomes | Scope.Scope
  >
) =>
  await Effect.runPromiseExit(
    Effect.gen(function* withOutcomes() {
      const outcomes = yield* Ref.make<readonly Cause.Cause<unknown>[]>([]);
      return yield* Effect.scoped(effect).pipe(
        Effect.provideService(CleanupOutcomes, outcomes)
      );
    }).pipe(Effect.provide(NodeFileSystem.layer))
  );

const messageOf = <A, E>(exit: Exit.Exit<A, E>) =>
  Exit.isFailure(exit)
    ? exit.cause.reasons
        .filter(Cause.isFailReason)
        .map((reason) => String(reason.error))
        .join("\n")
    : "";

const DEAD_PID = 2 ** 30;

const openRun = (
  dir: string,
  id: string,
  browserPid: number | null,
  upPid = DEAD_PID
) => {
  writeFileSync(
    path.join(dir, `slot-${id}.json`),
    JSON.stringify({ browserPid, checkout: "/elsewhere", run: id, upPid })
  );
};

describe("the bench lock", () => {
  afterEach(() => {
    for (const dir of dirs.splice(0)) {
      rmSync(dir, { force: true, recursive: true });
    }
  });

  it("lets one bench in, fails a second at once naming the holder, and frees on exit", async () => {
    const dir = freshDir();
    const file = path.join(dir, "bench.lock");
    const seen: string[] = [];
    const first = await run(
      Effect.gen(function* twoBenches() {
        yield* holdBench("measure.ts --label first", [], dir);
        seen.push(readFileSync(file, "utf-8"));
        const second = yield* Effect.exit(
          Effect.scoped(holdBench("perf:gpu --a x --b y", [], dir))
        );
        seen.push(messageOf(second));
      })
    );
    expect(Exit.isSuccess(first)).toBeTruthy();
    expect(seen[0]).toBe(
      JSON.stringify({ label: "measure.ts --label first", pid: process.pid })
    );
    expect(seen[1]).toContain(`pid ${process.pid}, measure.ts --label first`);
    expect(existsSync(file)).toBeFalsy();
    expect(Exit.isSuccess(await run(holdBench("third", [], dir)))).toBeTruthy();
  });

  it("refuses to measure while another rv run has a browser open, and frees the lock", async () => {
    const dir = freshDir();
    openRun(dir, "1", process.pid);
    const exit = await run(holdBench("next", [], dir));
    expect(messageOf(exit)).toContain("1 from /elsewhere");
    expect(existsSync(path.join(dir, "bench.lock"))).toBeFalsy();
  });

  it("refuses to measure while another rv up is still starting its browser", async () => {
    const dir = freshDir();
    openRun(dir, "1", null, process.pid);
    const exit = await run(holdBench("next", [], dir));
    expect(messageOf(exit)).toContain("1 from /elsewhere");
  });

  it("measures beside the runs it names and beside runs whose browser is gone", async () => {
    const dir = freshDir();
    openRun(dir, "1", process.pid);
    openRun(dir, "2", 2 ** 30);
    openRun(dir, "3", null);
    expect(
      Exit.isSuccess(await run(holdBench("next", ["1"], dir)))
    ).toBeTruthy();
  });

  it("refuses rv commands that draw while a bench holds the lock, then lets them through", async () => {
    const dir = freshDir();
    await run(
      Effect.gen(function* duringBench() {
        yield* holdBench("campaign", [], dir);
        const refused = yield* Effect.exit(refuseDuringBench("open", dir));
        expect(messageOf(refused)).toContain(
          `rv open would draw on the GPU while a bench is measuring it: pid ${process.pid}, campaign`
        );
      })
    );
    expect(
      Exit.isSuccess(await run(refuseDuringBench("open", dir)))
    ).toBeTruthy();
  });

  it("lets a bench's own children draw and measure under its lock", async () => {
    const dir = freshDir();
    const file = path.join(dir, "bench.lock");
    await run(
      Effect.gen(function* insideCampaign() {
        yield* holdBench("campaign", [], dir);
        vi.stubEnv("RUSHLINE_BENCH_PID", String(process.pid));
        expect(
          Exit.isSuccess(yield* Effect.exit(refuseDuringBench("open", dir)))
        ).toBeTruthy();
        expect(
          Exit.isSuccess(
            yield* Effect.exit(Effect.scoped(holdBench("child", [], dir)))
          )
        ).toBeTruthy();
        expect(readFileSync(file, "utf-8")).toContain("campaign");
        expect(benchChildEnv().RUSHLINE_BENCH_PID).toBe(String(process.pid));
        vi.unstubAllEnvs();
      })
    );
    expect(existsSync(file)).toBeFalsy();
  });

  it("passes the campaign's owner to grandchildren, not the child's own pid", () => {
    vi.stubEnv("RUSHLINE_BENCH_PID", "4242");
    expect(benchChildEnv().RUSHLINE_BENCH_PID).toBe("4242");
    vi.unstubAllEnvs();
  });

  it("still refuses another open run when measuring inside a campaign", async () => {
    const dir = freshDir();
    await run(
      Effect.gen(function* insideCampaign() {
        yield* holdBench("campaign", [], dir);
        vi.stubEnv("RUSHLINE_BENCH_PID", String(process.pid));
        openRun(dir, "1", process.pid);
        const refused = yield* Effect.exit(
          Effect.scoped(holdBench("measure", [], dir))
        );
        expect(messageOf(refused)).toContain("1 from /elsewhere");
        const allowed = yield* Effect.exit(
          Effect.scoped(holdBench("perf:gpu", ["1"], dir))
        );
        expect(Exit.isSuccess(allowed)).toBeTruthy();
        vi.unstubAllEnvs();
      })
    );
  });

  it("recovers a claim whose pid died", async () => {
    const dir = freshDir();
    const file = path.join(dir, "bench.lock");
    writeFileSync(file, JSON.stringify({ label: "crashed", pid: 2 ** 30 }));
    expect(Exit.isSuccess(await run(holdBench("next", [], dir)))).toBeTruthy();
    expect(existsSync(file)).toBeFalsy();
  });

  it("recovers a claim it cannot read", async () => {
    const dir = freshDir();
    writeFileSync(path.join(dir, "bench.lock"), "not json");
    expect(Exit.isSuccess(await run(holdBench("next", [], dir)))).toBeTruthy();
  });

  it("names a live process that is clearing a dead claim, and leaves the claim to it", async () => {
    const dir = freshDir();
    const file = path.join(dir, "bench.lock");
    const dead = JSON.stringify({ label: "crashed", pid: 2 ** 30 });
    writeFileSync(file, dead);
    writeFileSync(
      `${file}.clearing`,
      JSON.stringify({ label: "clearing", pid: process.pid })
    );
    const exit = await run(holdBench("next", [], dir));
    expect(messageOf(exit)).toContain(`pid ${process.pid}, clearing`);
    expect(readFileSync(file, "utf-8")).toBe(dead);
  });

  it("clears a clearer that died, then the claim it left", async () => {
    const dir = freshDir();
    const file = path.join(dir, "bench.lock");
    const dead = JSON.stringify({ label: "crashed", pid: 2 ** 30 });
    writeFileSync(file, dead);
    writeFileSync(`${file}.clearing`, dead);
    writeFileSync(`${file}.clearing.clearing`, "not json");
    expect(Exit.isSuccess(await run(holdBench("next", [], dir)))).toBeTruthy();
    expect(readdirSync(dir)).toStrictEqual([]);
  });
});
