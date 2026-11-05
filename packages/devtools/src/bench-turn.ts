import path from "node:path";

import * as Clock from "effect/Clock";
import * as Effect from "effect/Effect";
import * as Exit from "effect/Exit";
import * as Fiber from "effect/Fiber";
import * as FileSystem from "effect/FileSystem";
import * as Option from "effect/Option";
import * as Schema from "effect/Schema";

import { BenchBusy } from "./bench-busy.ts";
import {
  book,
  changeQueue,
  clockOf,
  deadlineOf,
  endJob,
  endedLine,
  holdsLine,
  release,
  startGroup,
  startJob,
  touch,
  turnOf,
} from "./bench-queue.ts";
import type {
  BookingRequest,
  Ended,
  Holder,
  Job,
  QueueFile,
} from "./bench-queue.ts";
import { CurrentHost } from "./browser-host.ts";
import type { MachineHost } from "./browser-host.ts";
import { toolStateDir } from "./claim.ts";
import { released } from "./cleanup.ts";
import { alive } from "./process.ts";

const IMPLICIT_LANE = "bench";
const IMPLICIT_MINUTES = 120;
const BENCH_PID = "RUSHLINE_BENCH_PID";
const BOOKING_SETTING = "RUSHLINE_BOOKING";
const QUEUE_PATIENCE_MS = 3_600_000;
const QUEUE_POLL_MS = 5000;

export const benchChildEnv = (): NodeJS.ProcessEnv => ({
  ...process.env,
  [BENCH_PID]: process.env[BENCH_PID] ?? String(process.pid),
});

interface Caller {
  readonly bench: string | undefined;
  readonly booking: string | null;
  readonly host: MachineHost;
  readonly label: string;
  readonly pid: number;
}

const callerOf = (host: MachineHost, label: string): Caller => {
  const booking = process.env[BOOKING_SETTING] ?? "";
  return {
    bench: process.env[BENCH_PID],
    booking: booking === "" ? null : booking,
    host,
    label,
    pid: process.pid,
  };
};

const runningJob = (queue: QueueFile): Job | null =>
  queue.holder?.use.kind === "job" ? queue.holder.use : null;

const insideJob = (queue: QueueFile, caller: Caller): boolean => {
  const job = runningJob(queue);
  return job !== null && String(job.pid) === caller.bench;
};

const requiredText = (what: string, host: MachineHost) =>
  `This machine (${host.id}) is shared through the bench queue, so ${what} needs a booking. Book a turn, wait for it, then run under it:
  rv book <lane> <minutes> <purpose>    prints BOOKING=<id>
  rv book wait <id>                     returns when it is your turn
  ${BOOKING_SETTING}=<id> ${what}
From the Mac, pnpm vimaan book, wait and run do the same over SSH. rv book status shows the queue.`;

const goneText = (id: string, over: Ended | null) =>
  over === null
    ? `No booking ${id} is live or recently ended. rv book status shows the queue.`
    : `Booking ${endedLine(over)}. Book again with rv book.`;

const waitingText = (id: string, held: Holder, place: number) =>
  `Booking ${id} is number ${place} in line: ${holdsLine(held)}. rv book wait ${id} returns when it is your turn.`;

const measuringText = (job: Job) =>
  `a bench is measuring it: pid ${job.pid}, ${job.label}`;

interface Admitted {
  readonly deadline: number;
  readonly id: string;
  readonly kind: "admitted";
}

interface Refused {
  readonly kind: "refused";
  readonly message: string;
}

type Claim =
  | Admitted
  | Refused
  | { readonly holder: Holder; readonly kind: "wait"; readonly reason: string };

type Admission = Admitted | Refused | { readonly kind: "inside" };

const asAdmission = (claim: Claim): Admission =>
  claim.kind === "wait" ? { kind: "refused", message: claim.reason } : claim;

const claimTurn = (
  queue: QueueFile,
  id: string,
  caller: Caller
): readonly [QueueFile, Claim] => {
  const view = turnOf(queue, id);
  switch (view.kind) {
    case "ended": {
      return [queue, { kind: "refused", message: goneText(id, view.ended) }];
    }
    case "waiting": {
      return [
        queue,
        {
          holder: view.holder,
          kind: "wait",
          reason: waitingText(id, view.holder, view.place),
        },
      ];
    }
    case "held": {
      const { use } = view.holder;
      return use.kind === "job"
        ? [
            queue,
            {
              holder: view.holder,
              kind: "wait",
              reason: `Booking ${id} holds this machine, and ${measuringText(use)}. Two benches at once skew each other, so wait for it.`,
            },
          ]
        : [
            startJob(queue, id, caller.pid, caller.label),
            { deadline: deadlineOf(view.holder), id, kind: "admitted" },
          ];
    }
    default: {
      return view satisfies never;
    }
  }
};

const implicitRequest = (caller: Caller): BookingRequest => ({
  lane: IMPLICIT_LANE,
  minutes: IMPLICIT_MINUTES,
  owner: { kind: "process", pid: caller.pid },
  purpose: caller.label,
});

const admit = (
  queue: QueueFile,
  caller: Caller,
  now: number
): readonly [QueueFile, Admission] => {
  if (insideJob(queue, caller)) {
    return [queue, { kind: "inside" }];
  }
  if (caller.booking !== null) {
    const [next, claim] = claimTurn(queue, caller.booking, caller);
    return [next, asAdmission(claim)];
  }
  switch (caller.host.booking) {
    case "required": {
      return [
        queue,
        { kind: "refused", message: requiredText(caller.label, caller.host) },
      ];
    }
    case "implicit": {
      if (queue.holder !== null) {
        return [
          queue,
          {
            kind: "refused",
            message: `Another bench holds this machine: ${holdsLine(queue.holder)}. Two benches at once skew each other, so wait for it.`,
          },
        ];
      }
      const [booked, id] = book(queue, implicitRequest(caller), now);
      const [started, claim] = claimTurn(booked, id, caller);
      return claim.kind === "admitted"
        ? [started, claim]
        : [queue, asAdmission(claim)];
    }
    default: {
      return caller.host.booking satisfies never;
    }
  }
};

const endedJob = (id: string, dir: string) =>
  released(
    changeQueue((queue, now) => [endJob(queue, id, now), null] as const, dir)
  );

const decodeSlot = Schema.decodeUnknownOption(
  Schema.fromJsonString(
    Schema.Struct({
      browserPid: Schema.NullOr(Schema.Number),
      checkout: Schema.String,
      run: Schema.String,
      upPid: Schema.Number,
    })
  )
);

const liveRunsBesides = Effect.fnUntraced(function* liveRunsBesides(
  allowed: readonly string[],
  dir: string
) {
  const fs = yield* FileSystem.FileSystem;
  const names = yield* fs.readDirectory(dir);
  const texts = yield* Effect.all(
    names
      .filter((name) => /^slot-\d+\.json$/u.test(name))
      .map((name) => fs.readFileString(path.join(dir, name))),
    { concurrency: "unbounded" }
  );
  return texts.flatMap((text) => {
    const slot = Option.getOrNull(decodeSlot(text));
    return slot !== null &&
      (alive(slot.browserPid) || alive(slot.upPid)) &&
      !allowed.includes(slot.run)
      ? [`${slot.run} from ${slot.checkout}`]
      : [];
  });
});

const stopAt = Effect.fnUntraced(function* stopAt(
  deadline: number,
  label: string
) {
  const caller = yield* Effect.fiber;
  const left = deadline - (yield* Clock.currentTimeMillis);
  yield* Effect.forkScoped(
    Effect.sleep(Math.max(0, left)).pipe(
      Effect.andThen(
        Effect.sync(() => {
          process.stderr.write(
            `${label}: stopped at ${clockOf(deadline)}, because its booking ran out: its expected end plus 15 min.\n`
          );
        })
      ),
      Effect.andThen(Effect.forkDetach(Fiber.interrupt(caller)))
    )
  );
});

export const recordWorkload = (group: number, dir: string = toolStateDir) =>
  changeQueue(
    (queue) => [startGroup(queue, process.pid, group), null] as const,
    dir
  );

export const holdBench = Effect.fnUntraced(function* holdBench(
  label: string,
  allowedRuns: readonly string[] = [],
  dir: string = toolStateDir
) {
  const caller = callerOf(yield* CurrentHost, label);
  const { result } = yield* Effect.acquireRelease(
    changeQueue((queue, now) => admit(queue, caller, now), dir),
    ({ result: admitted }) =>
      admitted.kind === "admitted" ? endedJob(admitted.id, dir) : Effect.void
  );
  if (result.kind === "refused") {
    yield* new BenchBusy({ message: result.message });
  }
  const others = yield* liveRunsBesides(allowedRuns, dir);
  if (others.length > 0) {
    yield* new BenchBusy({
      message: `A browser from another rv run is open or starting on this machine and would skew the bench: ${others.join(", ")}. If the run is yours, rv down --run <id>. If not, wait for it.`,
    });
  }
  if (result.kind === "admitted") {
    yield* stopAt(result.deadline, label);
  }
});

interface Patience {
  readonly dir: string;
  readonly patienceMs: number;
  readonly pollMs: number;
}

type Entry =
  | { readonly kind: "inside" }
  | { readonly id: string; readonly kind: "booked" | "lane" }
  | { readonly kind: "refused"; readonly message: string };

const enter = (
  queue: QueueFile,
  caller: Caller,
  now: number
): readonly [QueueFile, Entry] => {
  if (insideJob(queue, caller)) {
    return [queue, { kind: "inside" }];
  }
  if (caller.booking !== null) {
    return [queue, { id: caller.booking, kind: "lane" }];
  }
  switch (caller.host.booking) {
    case "required": {
      return [
        queue,
        { kind: "refused", message: requiredText(caller.label, caller.host) },
      ];
    }
    case "implicit": {
      const [booked, id] = book(queue, implicitRequest(caller), now);
      return [booked, { id, kind: "booked" }];
    }
    default: {
      return caller.host.booking satisfies never;
    }
  }
};

const awaitTurn = Effect.fnUntraced(function* awaitTurn(
  id: string,
  caller: Caller,
  { dir, patienceMs, pollMs }: Patience
) {
  const attempt = Effect.acquireRelease(
    changeQueue((queue) => claimTurn(queue, id, caller), dir),
    ({ result: claimed }) =>
      claimed.kind === "admitted" ? endedJob(claimed.id, dir) : Effect.void
  );
  const startedAt = yield* Clock.currentTimeMillis;
  let announced = "";
  let { result: claim } = yield* attempt;
  while (claim.kind === "wait") {
    if ((yield* Clock.currentTimeMillis) - startedAt >= patienceMs) {
      yield* new BenchBusy({
        message: `Gave up after ${patienceMs} ms waiting for another bench on this machine: ${holdsLine(claim.holder)}.`,
      });
    }
    const shown = `${claim.holder.booking.id} ${claim.holder.use.kind}`;
    if (shown !== announced) {
      announced = shown;
      process.stderr.write(
        `Queued behind ${holdsLine(claim.holder)}. Two benches at once skew each other.\n`
      );
    }
    yield* Effect.sleep(pollMs);
    ({ result: claim } = yield* attempt);
  }
  if (claim.kind === "refused") {
    yield* new BenchBusy({ message: claim.message });
  }
  if (claim.kind === "admitted") {
    yield* stopAt(claim.deadline, caller.label);
  }
});

export const queueForBench = Effect.fnUntraced(function* queueForBench(
  label: string,
  {
    dir = toolStateDir,
    patienceMs = QUEUE_PATIENCE_MS,
    pollMs = QUEUE_POLL_MS,
  }: Partial<Patience> = {}
) {
  const caller = callerOf(yield* CurrentHost, label);
  const { result: entry } = yield* Effect.acquireRelease(
    changeQueue((queue, now) => enter(queue, caller, now), dir),
    ({ result: entered }, exit) =>
      entered.kind === "booked"
        ? released(
            changeQueue(
              (queue, now) =>
                [
                  release(
                    queue,
                    entered.id,
                    now,
                    Exit.isSuccess(exit) ? "finished" : "stopped"
                  ),
                  null,
                ] as const,
              dir
            )
          )
        : Effect.void
  );
  if (entry.kind === "refused") {
    yield* new BenchBusy({ message: entry.message });
  }
  if (entry.kind === "booked" || entry.kind === "lane") {
    yield* awaitTurn(entry.id, caller, { dir, patienceMs, pollMs });
  }
});

const turnCheck = (
  queue: QueueFile,
  caller: Caller,
  now: number
): readonly [QueueFile, string | null] => {
  if (insideJob(queue, caller)) {
    return [queue, null];
  }
  const job = runningJob(queue);
  const measuring =
    job === null
      ? null
      : `${caller.label} would draw on this machine while ${measuringText(job)}. Wait for it. rv list, rv shot and rv down still work.`;
  switch (caller.host.booking) {
    case "required": {
      if (caller.booking === null) {
        return [queue, requiredText(caller.label, caller.host)];
      }
      const view = turnOf(queue, caller.booking);
      switch (view.kind) {
        case "ended": {
          return [queue, goneText(caller.booking, view.ended)];
        }
        case "waiting": {
          return [queue, waitingText(caller.booking, view.holder, view.place)];
        }
        case "held": {
          return measuring === null
            ? [touch(queue, caller.booking, now), null]
            : [queue, measuring];
        }
        default: {
          return view satisfies never;
        }
      }
    }
    case "implicit": {
      if (measuring !== null) {
        return [queue, measuring];
      }
      return [
        caller.booking === null ? queue : touch(queue, caller.booking, now),
        null,
      ];
    }
    default: {
      return caller.host.booking satisfies never;
    }
  }
};

export const checkTurn = Effect.fnUntraced(function* checkTurn(
  command: string,
  dir: string = toolStateDir
) {
  const caller = callerOf(yield* CurrentHost, `rv ${command}`);
  const { result } = yield* changeQueue(
    (queue, now) => turnCheck(queue, caller, now),
    dir
  );
  if (result !== null) {
    yield* new BenchBusy({ message: result });
  }
});
