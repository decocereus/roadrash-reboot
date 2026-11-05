import {
  mkdtempSync,
  readFileSync,
  readdirSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

import * as NodeFileSystem from "@effect/platform-node/NodeFileSystem";
import {
  book,
  changeQueue,
  release,
  startJob,
} from "@racer/devtools/bench-queue";
import type { BookingRequest, QueueFile } from "@racer/devtools/bench-queue";
import {
  benchChildEnv,
  checkTurn,
  holdBench,
  queueForBench,
} from "@racer/devtools/bench-turn";
import { CurrentHost, browserHosts } from "@racer/devtools/browser-host";
import type { MachineHost } from "@racer/devtools/browser-host";
import { CleanupOutcomes } from "@racer/devtools/cleanup";
import * as Cause from "effect/Cause";
import * as Effect from "effect/Effect";
import * as Exit from "effect/Exit";
import type * as FileSystem from "effect/FileSystem";
import * as Layer from "effect/Layer";
import * as Ref from "effect/Ref";
import * as Schema from "effect/Schema";
import type * as Scope from "effect/Scope";
import { afterEach, describe, expect, it, vi } from "vitest";

const dirs: string[] = [];
const MAC: MachineHost = {
  ...browserHosts["macos-metal"],
  booking: "implicit",
};
const VIMAAN: MachineHost = {
  ...browserHosts["linux-intel"],
  booking: "required",
};
const DEAD_PID = 2 ** 30;

const freshDir = () => {
  const dir = mkdtempSync(path.join(tmpdir(), "rushline-bench-queue-test-"));
  dirs.push(dir);
  return dir;
};

const run = async <A, E>(
  effect: Effect.Effect<
    A,
    E,
    FileSystem.FileSystem | CleanupOutcomes | CurrentHost | Scope.Scope
  >,
  host: MachineHost = MAC
) =>
  await Effect.runPromiseExit(
    Effect.gen(function* withOutcomes() {
      const outcomes = yield* Ref.make<readonly Cause.Cause<unknown>[]>([]);
      return yield* Effect.scoped(effect).pipe(
        Effect.provideService(CleanupOutcomes, outcomes)
      );
    }).pipe(
      Effect.provide(
        Layer.mergeAll(NodeFileSystem.layer, Layer.succeed(CurrentHost)(host))
      )
    )
  );

const messageOf = <A, E>(exit: Exit.Exit<A, E>) =>
  Exit.isFailure(exit)
    ? exit.cause.reasons
        .filter(Cause.isFailReason)
        .map((reason) => String(reason.error))
        .join("\n")
    : "";

const decodeQueue = Schema.decodeUnknownSync(
  Schema.Struct({
    ended: Schema.Array(
      Schema.Struct({ id: Schema.String, why: Schema.String })
    ),
    holder: Schema.NullOr(
      Schema.Struct({
        booking: Schema.Struct({ id: Schema.String }),
        since: Schema.Number,
        use: Schema.Struct({
          kind: Schema.String,
          label: Schema.optionalKey(Schema.String),
          pid: Schema.optionalKey(Schema.Number),
          since: Schema.optionalKey(Schema.Number),
        }),
      })
    ),
    waiting: Schema.Array(Schema.Struct({ id: Schema.String })),
  })
);

const queueIn = (dir: string) =>
  decodeQueue(
    JSON.parse(readFileSync(path.join(dir, "bench-queue.json"), "utf-8"))
  );

const lane = (name: string): BookingRequest => ({
  lane: name,
  minutes: 30,
  owner: { kind: "lane" },
  purpose: `${name} work`,
});

const booked = (dir: string, request: BookingRequest) =>
  changeQueue((queue: QueueFile, now) => book(queue, request, now), dir).pipe(
    Effect.map(({ result }) => result)
  );

const runningJob = (dir: string, id: string, label: string) =>
  changeQueue(
    (queue: QueueFile) =>
      [startJob(queue, id, process.pid, label), null] as const,
    dir
  );

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

describe("the bench queue on a host that books implicitly", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
    for (const dir of dirs.splice(0)) {
      rmSync(dir, { force: true, recursive: true });
    }
  });

  it("lets one bench in, fails a second at once naming the holder, and ends its booking on exit", async () => {
    const dir = freshDir();
    const seen: string[] = [];
    const first = await run(
      Effect.gen(function* twoBenches() {
        yield* holdBench("measure.ts --label first", [], dir);
        seen.push(JSON.stringify(queueIn(dir).holder?.use));
        const second = yield* Effect.exit(
          Effect.scoped(holdBench("perf:gpu --a x --b y", [], dir))
        );
        seen.push(messageOf(second));
      })
    );
    expect(Exit.isSuccess(first)).toBeTruthy();
    expect(seen[0]).toBe(
      JSON.stringify({
        kind: "job",
        label: "measure.ts --label first",
        pid: process.pid,
      })
    );
    expect(seen[1]).toContain(
      `running measure.ts --label first (pid ${process.pid})`
    );
    expect(queueIn(dir)).toMatchObject({
      ended: [{ why: "finished" }],
      holder: null,
    });
    expect(Exit.isSuccess(await run(holdBench("third", [], dir)))).toBeTruthy();
  });

  it("queues behind a holder, takes over when it frees, and ends its booking on exit", async () => {
    const dir = freshDir();
    const seen: string[] = [];
    const exit = await run(
      Effect.gen(function* inTurn() {
        const other = yield* booked(dir, lane("other"));
        yield* runningJob(dir, other, "other run");
        yield* Effect.forkScoped(
          Effect.sleep(30).pipe(
            Effect.andThen(
              changeQueue(
                (queue: QueueFile, now) =>
                  [release(queue, other, now, "released"), null] as const,
                dir
              )
            )
          )
        );
        yield* queueForBench("pnpm perf gate", { dir, pollMs: 2 });
        seen.push(JSON.stringify(queueIn(dir).holder?.use));
      })
    );
    expect(Exit.isSuccess(exit)).toBeTruthy();
    expect(seen[0]).toBe(
      JSON.stringify({
        kind: "job",
        label: "pnpm perf gate",
        pid: process.pid,
      })
    );
    expect(queueIn(dir)).toMatchObject({
      ended: [{ why: "finished" }, { id: "other-1", why: "released" }],
      holder: null,
    });
  });

  it("stops queueing at its patience, names the holder and leaves it holding", async () => {
    const dir = freshDir();
    const exit = await run(
      Effect.gen(function* impatient() {
        const other = yield* booked(dir, lane("other"));
        yield* runningJob(dir, other, "other run");
        yield* queueForBench("pnpm perf gate", {
          dir,
          patienceMs: 5,
          pollMs: 2,
        });
      })
    );
    expect(messageOf(exit)).toContain(
      `other-1 holds it for other work, turn since`
    );
    expect(messageOf(exit)).toContain(`running other run (pid ${process.pid})`);
    expect(queueIn(dir)).toMatchObject({
      holder: { booking: { id: "other-1" } },
      waiting: [],
    });
  });

  it("refuses to measure while another rv run has a browser open, and ends its booking", async () => {
    const dir = freshDir();
    openRun(dir, "1", process.pid);
    const exit = await run(holdBench("next", [], dir));
    expect(messageOf(exit)).toContain("1 from /elsewhere");
    expect(queueIn(dir).holder).toBeNull();
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
    openRun(dir, "2", DEAD_PID);
    openRun(dir, "3", null);
    expect(
      Exit.isSuccess(await run(holdBench("next", ["1"], dir)))
    ).toBeTruthy();
  });

  it("refuses rv commands that draw while a bench measures, then lets them through", async () => {
    const dir = freshDir();
    await run(
      Effect.gen(function* duringBench() {
        yield* holdBench("campaign", [], dir);
        const refused = yield* Effect.exit(checkTurn("open", dir));
        expect(messageOf(refused)).toContain(
          `rv open would draw on this machine while a bench is measuring it: pid ${process.pid}, campaign`
        );
      })
    );
    expect(Exit.isSuccess(await run(checkTurn("open", dir)))).toBeTruthy();
  });

  it("lets a bench's own children draw and measure under its job", async () => {
    const dir = freshDir();
    await run(
      Effect.gen(function* insideCampaign() {
        yield* holdBench("campaign", [], dir);
        vi.stubEnv("RUSHLINE_BENCH_PID", String(process.pid));
        expect(
          Exit.isSuccess(yield* Effect.exit(checkTurn("open", dir)))
        ).toBeTruthy();
        const child = yield* Effect.exit(
          Effect.scoped(holdBench("child", [], dir))
        );
        expect(Exit.isSuccess(child) ? child.value : "failed").toBeNull();
        expect(queueIn(dir).holder?.use.label).toBe("campaign");
        expect(benchChildEnv().RUSHLINE_BENCH_PID).toBe(String(process.pid));
        vi.unstubAllEnvs();
      })
    );
    expect(queueIn(dir).holder).toBeNull();
  });

  it("passes the campaign's owner to grandchildren, not the child's own pid", () => {
    vi.stubEnv("RUSHLINE_BENCH_PID", "4242");
    expect(benchChildEnv().RUSHLINE_BENCH_PID).toBe("4242");
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

  it("drops a holder whose process died", async () => {
    const dir = freshDir();
    writeFileSync(
      path.join(dir, "bench-queue.json"),
      JSON.stringify({
        ended: [],
        holder: {
          booking: {
            bookedAt: 0,
            id: "bench-1",
            lane: "bench",
            minutes: 120,
            owner: { kind: "process", pid: DEAD_PID },
            purpose: "crashed",
          },
          since: Date.now(),
          use: { group: null, kind: "job", label: "crashed", pid: DEAD_PID },
        },
        next: 2,
        waiting: [],
      })
    );
    expect(Exit.isSuccess(await run(holdBench("next", [], dir)))).toBeTruthy();
    expect(queueIn(dir).ended.map((entry) => entry.why)).toStrictEqual([
      "finished",
      `its process ${DEAD_PID} died`,
    ]);
  });

  it("reads a queue file it cannot decode as an empty queue", async () => {
    const dir = freshDir();
    writeFileSync(path.join(dir, "bench-queue.json"), "not json");
    expect(Exit.isSuccess(await run(holdBench("next", [], dir)))).toBeTruthy();
  });

  it("clears a lock whose holder died, and a clearer that died, then leaves only the queue", async () => {
    const dir = freshDir();
    const lock = path.join(dir, "bench-queue.lock");
    const dead = JSON.stringify({ label: "crashed", pid: DEAD_PID });
    writeFileSync(lock, dead);
    writeFileSync(`${lock}.clearing`, dead);
    writeFileSync(`${lock}.clearing.clearing`, "not json");
    expect(Exit.isSuccess(await run(holdBench("next", [], dir)))).toBeTruthy();
    expect(readdirSync(dir)).toStrictEqual(["bench-queue.json"]);
  });
});

describe("the bench queue on a host that requires a booking", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
    for (const dir of dirs.splice(0)) {
      rmSync(dir, { force: true, recursive: true });
    }
  });

  it("refuses a bench and a drawing rv command without a booking, and names the queue", async () => {
    const dir = freshDir();
    const bench = await run(holdBench("perf:gpu --a x --b y", [], dir), VIMAAN);
    const drawing = await run(checkTurn("up", dir), VIMAAN);
    expect(messageOf(bench)).toContain("perf:gpu --a x --b y needs a booking");
    expect(messageOf(bench)).toContain("rv book <lane> <minutes> <purpose>");
    expect(messageOf(drawing)).toContain("rv up needs a booking");
    expect(queueIn(dir).holder).toBeNull();
  });

  it("runs a bench under the holder's booking and gives the turn back idle", async () => {
    const dir = freshDir();
    const seen: unknown[] = [];
    const exit = await run(
      Effect.gen(function* underBooking() {
        const id = yield* booked(dir, lane("maps"));
        vi.stubEnv("RUSHLINE_BOOKING", id);
        yield* holdBench("perf:gpu", [], dir);
        const running = queueIn(dir).holder?.use;
        vi.stubEnv("RUSHLINE_BOOKING", "");
        seen.push(
          running?.kind === "job" ? running.label : null,
          messageOf(yield* Effect.exit(checkTurn("open", dir)))
        );
      }),
      VIMAAN
    );
    expect(Exit.isSuccess(exit)).toBeTruthy();
    expect(seen[0]).toBe("perf:gpu");
    expect(seen[1]).toContain("rv open needs a booking");
    expect(queueIn(dir).holder).toMatchObject({
      booking: { id: "maps-1" },
      use: { kind: "idle" },
    });
  });

  it("refuses a booking that waits, naming the lane that holds it", async () => {
    const dir = freshDir();
    const exits = await run(
      Effect.gen(function* waitingLane() {
        yield* booked(dir, lane("maps"));
        const id = yield* booked(dir, lane("mp"));
        vi.stubEnv("RUSHLINE_BOOKING", id);
        return [
          messageOf(
            yield* Effect.exit(Effect.scoped(holdBench("perf:gpu", [], dir)))
          ),
          messageOf(yield* Effect.exit(checkTurn("open", dir))),
        ];
      }),
      VIMAAN
    );
    const messages = Exit.isSuccess(exits) ? exits.value : [];
    expect(messages).toHaveLength(2);
    for (const message of messages) {
      expect(message).toContain(
        "Booking mp-2 is number 1 in line: maps-1 holds it"
      );
    }
  });

  it("refuses a booking that ended and says why", async () => {
    const dir = freshDir();
    const exit = await run(
      Effect.gen(function* endedLane() {
        const id = yield* booked(dir, lane("maps"));
        yield* changeQueue(
          (queue: QueueFile, now) =>
            [release(queue, id, now, "released"), null] as const,
          dir
        );
        vi.stubEnv("RUSHLINE_BOOKING", id);
        yield* holdBench("perf:gpu", [], dir);
      }),
      VIMAAN
    );
    expect(messageOf(exit)).toContain("maps-1 (maps work) ended at");
    expect(messageOf(exit)).toContain(": released");
  });

  it("keeps the holder's turn alive each time it draws", async () => {
    const dir = freshDir();
    const exit = await run(
      Effect.gen(function* drawing() {
        const id = yield* booked(dir, lane("maps"));
        const before = queueIn(dir).holder?.use.since ?? Number.NaN;
        yield* Effect.sleep(5);
        vi.stubEnv("RUSHLINE_BOOKING", id);
        yield* checkTurn("open", dir);
        return (queueIn(dir).holder?.use.since ?? before) > before;
      }),
      VIMAAN
    );
    expect(Exit.isSuccess(exit) ? exit.value : false).toBeTruthy();
  });
});
