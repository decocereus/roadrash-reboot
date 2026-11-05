import path from "node:path";

import * as Clock from "effect/Clock";
import * as Effect from "effect/Effect";
import * as FileSystem from "effect/FileSystem";
import * as Option from "effect/Option";
import * as Schema from "effect/Schema";

import { BenchBusy } from "./bench-busy.ts";
import { toolStateDir, underClaim } from "./claim.ts";
import { alive } from "./process.ts";

export const IDLE_MS = 600_000;
export const OVERRUN_MS = 900_000;
export const STOP_MS = 60_000;
const MINUTE_MS = 60_000;
const ENDED_KEPT = 20;
const ENDED_SHOWN = 5;

export const laneName = Schema.String.check(
  Schema.isPattern(/^[a-z0-9][a-z0-9-]*$/u)
);

export const bookingMinutes = Schema.Int.check(
  Schema.isBetween({ maximum: 240, minimum: 1 })
);

const bookingOwner = Schema.Union([
  Schema.Struct({ kind: Schema.Literal("lane") }),
  Schema.Struct({ kind: Schema.Literal("process"), pid: Schema.Number }),
]);

const turnUse = Schema.Union([
  Schema.Struct({ kind: Schema.Literal("idle"), since: Schema.Number }),
  Schema.Struct({
    group: Schema.NullOr(Schema.Number),
    kind: Schema.Literal("job"),
    label: Schema.String,
    pid: Schema.Number,
  }),
]);

const queuedBooking = Schema.Struct({
  bookedAt: Schema.Number,
  id: Schema.String,
  lane: laneName,
  minutes: bookingMinutes,
  owner: bookingOwner,
  purpose: Schema.String,
});

const turnHolder = Schema.Struct({
  booking: queuedBooking,
  since: Schema.Number,
  use: turnUse,
});

const endedBooking = Schema.Struct({
  at: Schema.Number,
  id: Schema.String,
  lane: Schema.String,
  purpose: Schema.String,
  why: Schema.String,
});

const freeLine = Schema.Struct({
  holder: Schema.Null,
  waiting: Schema.Tuple([]),
});

const heldLine = Schema.Struct({
  holder: turnHolder,
  waiting: Schema.Array(queuedBooking),
});

const tally = { ended: Schema.Array(endedBooking), next: Schema.Number };

const queueRecord = Schema.Union([
  Schema.Struct({ ...tally, ...freeLine.fields }),
  Schema.Struct({ ...tally, ...heldLine.fields }),
]);

type Booking = typeof queuedBooking.Type;
export type Holder = typeof turnHolder.Type;
export type Ended = typeof endedBooking.Type;
export type QueueFile = typeof queueRecord.Type;
type Use = typeof turnUse.Type;
export type Job = Extract<Use, { readonly kind: "job" }>;
type Line = typeof freeLine.Type | typeof heldLine.Type;
type Liveness = (pid: number) => boolean;

export interface BookingRequest {
  readonly lane: string;
  readonly minutes: number;
  readonly owner: Booking["owner"];
  readonly purpose: string;
}

export type TurnView =
  | { readonly ended: Ended | null; readonly kind: "ended" }
  | { readonly holder: Holder; readonly kind: "held" }
  | {
      readonly holder: Holder;
      readonly kind: "waiting";
      readonly place: number;
    };

const emptyQueue: QueueFile = { ended: [], holder: null, next: 1, waiting: [] };

const idle = (since: number): Use => ({ kind: "idle", since });

const twoDigits = (value: number) => String(value).padStart(2, "0");

export const clockOf = (ms: number): string => {
  const at = new Date(ms);
  return `${twoDigits(at.getHours())}:${twoDigits(at.getMinutes())}`;
};

export const expectedEnd = (held: Holder): number =>
  held.since + held.booking.minutes * MINUTE_MS;

export const deadlineOf = (held: Holder): number =>
  expectedEnd(held) + OVERRUN_MS;

const ownerGone = (entry: Booking, isAlive: Liveness): string | null =>
  entry.owner.kind === "process" && !isAlive(entry.owner.pid)
    ? `its process ${entry.owner.pid} died`
    : null;

const jobAlive = (job: Job, isAlive: Liveness): boolean =>
  isAlive(job.pid) || (job.group !== null && isAlive(-job.group));

const stopping = (held: Holder, isAlive: Liveness): number =>
  held.use.kind === "job" && jobAlive(held.use, isAlive) ? STOP_MS : 0;

const endReason = (
  held: Holder,
  now: number,
  isAlive: Liveness
): string | null => {
  const gone = ownerGone(held.booking, isAlive);
  if (gone !== null) {
    return gone;
  }
  const end = expectedEnd(held);
  if (now > end + OVERRUN_MS + stopping(held, isAlive)) {
    return `ran past its expected end ${clockOf(end)} by more than 15 min`;
  }
  if (held.use.kind === "idle" && now - held.use.since > IDLE_MS) {
    return "idle for more than 10 min";
  }
  return null;
};

const endedOf = (entry: Booking, at: number, why: string): Ended => ({
  at,
  id: entry.id,
  lane: entry.lane,
  purpose: entry.purpose,
  why,
});

const withUse = (held: Holder, next: Use): Holder => ({ ...held, use: next });

const lineOf = (
  held: Holder | null,
  waiting: readonly Booking[],
  now: number
): Line => {
  if (held !== null) {
    return { holder: held, waiting };
  }
  const [first, ...rest] = waiting;
  return first === undefined
    ? { holder: null, waiting: [] }
    : { holder: { booking: first, since: now, use: idle(now) }, waiting: rest };
};

const recorded = (queue: QueueFile, gone: readonly Ended[]) =>
  [...gone, ...queue.ended].slice(0, ENDED_KEPT);

const settledHolder = (queue: QueueFile, now: number, isAlive: Liveness) => {
  if (queue.holder === null) {
    return { gone: [], kept: null };
  }
  const why = endReason(queue.holder, now, isAlive);
  if (why !== null) {
    return { gone: [endedOf(queue.holder.booking, now, why)], kept: null };
  }
  const { use } = queue.holder;
  return {
    gone: [],
    kept:
      use.kind === "job" && !jobAlive(use, isAlive)
        ? withUse(queue.holder, idle(now))
        : queue.holder,
  };
};

export const settle = (
  queue: QueueFile,
  now: number,
  isAlive: Liveness
): QueueFile => {
  const head = settledHolder(queue, now, isAlive);
  const waiters = queue.waiting.map((entry) => ({
    entry,
    why: ownerGone(entry, isAlive),
  }));
  const gone = waiters.flatMap(({ entry, why }) =>
    why === null ? [] : [endedOf(entry, now, why)]
  );
  const staying = waiters.flatMap(({ entry, why }) =>
    why === null ? [entry] : []
  );
  return {
    ended: recorded(queue, [...head.gone, ...gone]),
    next: queue.next,
    ...lineOf(head.kept, staying, now),
  };
};

export const book = (
  queue: QueueFile,
  request: BookingRequest,
  now: number
): readonly [QueueFile, string] => {
  const id = `${request.lane}-${queue.next}`;
  const entry: Booking = { ...request, bookedAt: now, id };
  return [
    {
      ended: queue.ended,
      next: queue.next + 1,
      ...lineOf(queue.holder, [...queue.waiting, entry], now),
    },
    id,
  ];
};

export const release = (
  queue: QueueFile,
  id: string,
  now: number,
  why: string
): QueueFile => {
  if (queue.holder === null) {
    return queue;
  }
  const gone = [queue.holder.booking, ...queue.waiting].find(
    (entry) => entry.id === id
  );
  if (gone === undefined) {
    return queue;
  }
  return {
    ended: recorded(queue, [endedOf(gone, now, why)]),
    next: queue.next,
    ...lineOf(
      queue.holder.booking.id === id ? null : queue.holder,
      queue.waiting.filter((entry) => entry.id !== id),
      now
    ),
  };
};

const withHolder = (
  queue: QueueFile,
  id: string,
  change: (held: Holder) => Holder
): QueueFile =>
  queue.holder?.booking.id === id
    ? { ...queue, holder: change(queue.holder) }
    : queue;

export const startJob = (
  queue: QueueFile,
  id: string,
  pid: number,
  label: string
): QueueFile =>
  withHolder(queue, id, (held) =>
    withUse(held, { group: null, kind: "job", label, pid })
  );

export const startGroup = (
  queue: QueueFile,
  pid: number,
  group: number
): QueueFile =>
  queue.holder?.use.kind === "job" && queue.holder.use.pid === pid
    ? {
        ...queue,
        holder: withUse(queue.holder, { ...queue.holder.use, group }),
      }
    : queue;

export const endJob = (
  queue: QueueFile,
  id: string,
  now: number
): QueueFile => {
  if (queue.holder?.booking.id !== id) {
    return queue;
  }
  const { owner } = queue.holder.booking;
  switch (owner.kind) {
    case "lane": {
      return withHolder(queue, id, (held) => withUse(held, idle(now)));
    }
    case "process": {
      return release(queue, id, now, "finished");
    }
    default: {
      return owner satisfies never;
    }
  }
};

export const touch = (queue: QueueFile, id: string, now: number): QueueFile =>
  withHolder(queue, id, (held) =>
    held.use.kind === "idle" ? withUse(held, idle(now)) : held
  );

export const turnOf = (queue: QueueFile, id: string): TurnView => {
  const over: TurnView = {
    ended: queue.ended.find((entry) => entry.id === id) ?? null,
    kind: "ended",
  };
  if (queue.holder === null) {
    return over;
  }
  if (queue.holder.booking.id === id) {
    return { holder: queue.holder, kind: "held" };
  }
  const place = queue.waiting.findIndex((entry) => entry.id === id);
  return place === -1
    ? over
    : { holder: queue.holder, kind: "waiting", place: place + 1 };
};

const useText = (current: Use): string => {
  switch (current.kind) {
    case "idle": {
      return `idle since ${clockOf(current.since)}`;
    }
    case "job": {
      return current.group === null
        ? `running ${current.label} (pid ${current.pid})`
        : `running ${current.label} (pid ${current.pid}, workload group ${current.group})`;
    }
    default: {
      return current satisfies never;
    }
  }
};

export const holdsLine = (held: Holder): string =>
  `${held.booking.id} holds it for ${held.booking.purpose}, turn since ${clockOf(held.since)}, expected end ${clockOf(expectedEnd(held))}, ${useText(held.use)}`;

export const endedLine = (entry: Ended): string =>
  `${entry.id} (${entry.purpose}) ended at ${clockOf(entry.at)}: ${entry.why}`;

export const describeQueue = (queue: QueueFile, now: number): string[] => {
  const endedLines = queue.ended
    .slice(0, ENDED_SHOWN)
    .map((entry) => `ended    ${endedLine(entry)}`);
  if (queue.holder === null) {
    return ["free     nobody holds it and nobody waits", ...endedLines];
  }
  const lines = [`holder   ${holdsLine(queue.holder)}`];
  let start = Math.max(now, expectedEnd(queue.holder));
  let place = 0;
  for (const entry of queue.waiting) {
    place += 1;
    lines.push(
      `waiting  ${place}. ${entry.id} for ${entry.purpose}, ${entry.minutes} min, booked ${clockOf(entry.bookedAt)}, starts about ${clockOf(start)}`
    );
    start += entry.minutes * MINUTE_MS;
  }
  return [...lines, ...endedLines];
};

interface QueuePaths {
  readonly draft: string;
  readonly lock: string;
  readonly queue: string;
}

const pathsIn = (dir: string): QueuePaths => ({
  draft: path.join(dir, "bench-queue.json.draft"),
  lock: path.join(dir, "bench-queue.lock"),
  queue: path.join(dir, "bench-queue.json"),
});

const decodeQueue = Schema.decodeUnknownOption(
  Schema.fromJsonString(queueRecord)
);

const readQueue = (paths: QueuePaths) =>
  FileSystem.FileSystem.use((fs) => fs.readFileString(paths.queue)).pipe(
    Effect.map((text) => Option.getOrElse(decodeQueue(text), () => emptyQueue)),
    Effect.catchReason("PlatformError", "NotFound", () =>
      Effect.succeed(emptyQueue)
    )
  );

const writeQueue = Effect.fnUntraced(function* writeQueue(
  paths: QueuePaths,
  queue: QueueFile
) {
  const fs = yield* FileSystem.FileSystem;
  yield* fs.writeFileString(paths.draft, `${JSON.stringify(queue, null, 1)}\n`);
  yield* fs.rename(paths.draft, paths.queue);
});

export const changeQueue = <A>(
  change: (queue: QueueFile, now: number) => readonly [QueueFile, A],
  dir: string = toolStateDir
) => {
  const paths = pathsIn(dir);
  return underClaim(
    paths.lock,
    "bench queue",
    Effect.gen(function* changing() {
      const now = yield* Clock.currentTimeMillis;
      const [changed, result] = change(
        settle(yield* readQueue(paths), now, alive),
        now
      );
      const queue = settle(changed, now, alive);
      yield* writeQueue(paths, queue);
      return { now, queue, result };
    }),
    (holder) =>
      new BenchBusy({
        message: `Pid ${holder.pid} (${holder.label}) has held the bench queue's lock ${paths.lock} for a minute. Find out what it is doing before you remove the lock.`,
      })
  );
};
