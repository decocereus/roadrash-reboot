import { parseArgs } from "node:util";

import {
  ROOM_TRACE_FIELDS,
  roomTraceName,
  RiderTraceSchema,
  RoomTraceSchema,
  TRACE_ROW_FIELDS,
  TRACE_VERSION,
  TraceField,
} from "@racer/rooms/tape";
import type { RiderTraceFile, RoomTrace } from "@racer/rooms/tape";
import { TICK_SECONDS } from "@racer/sim/state";
import * as Console from "effect/Console";
import * as Data from "effect/Data";
import * as Effect from "effect/Effect";
import * as FileSystem from "effect/FileSystem";
import * as Result from "effect/Result";
import * as Schema from "effect/Schema";

const USAGE =
  "Usage: pnpm rooms:trace --dir <folder holding one race's tape>, or --races <folder holding one folder per race>";
const RIDER_FILE = /^rider-(?<rider>\d+)\.trace\.json$/u;
const STALL_MS = 50;
const GAP_FLOORS_MS = [50, 100, 150, 250, 500] as const;
const TICK_GAP_MS: (typeof GAP_FLOORS_MS)[number] = 100;
const ROUND_TRIP_SPIKE_MS = 50;
const UNDER_SHARE = 0.01;
const P50 = 0.5;
const P90 = 0.9;
const SECONDS_IN_MINUTE = 60;
const MS_PER_SECOND = 1000;
const MS_PER_MINUTE = SECONDS_IN_MINUTE * MS_PER_SECOND;
const TICK_MS = TICK_SECONDS * MS_PER_SECOND;
const CLOCK_DIGITS = 2;
const PERCENT = 100;
const PERCENT_DIGITS = 2;
const listOf = new Intl.ListFormat("en", { type: "conjunction" });

class TraceReadFailed extends Data.TaggedError("TraceReadFailed")<{
  readonly cause?: unknown;
  readonly message: string;
}> {}

const decodeBrowser = Schema.decodeUnknownEffect(
  Schema.fromJsonString(RiderTraceSchema)
);
const decodeRoom = Schema.decodeUnknownEffect(
  Schema.fromJsonString(RoomTraceSchema)
);

const failed = (message: string) => (cause: unknown) =>
  new TraceReadFailed({ cause, message });

export interface RiderTrace {
  readonly rider: number;
  readonly trace: RiderTraceFile;
}

interface Moment {
  frameMs: number;
  gapMs: number;
  late: number;
  missed: number;
  rttMs: number;
  slowedMs: number;
  surged: number;
}

const freshMoment = (): Moment => ({
  frameMs: 0,
  gapMs: 0,
  late: 0,
  missed: 0,
  rttMs: 0,
  slowedMs: 0,
  surged: 0,
});

const secondOf = (tick: number): number => Math.floor(tick * TICK_SECONDS);

const momentAt = (moments: Map<number, Moment>, second: number): Moment => {
  const known = moments.get(second);
  if (known) {
    return known;
  }
  const fresh = freshMoment();
  moments.set(second, fresh);
  return fresh;
};

const chunks = (flat: readonly number[], size: number): readonly number[][] =>
  Array.from({ length: Math.floor(flat.length / size) }, (_, row) =>
    flat.slice(row * size, row * size + size)
  );

interface PlacedRow {
  readonly before: readonly number[] | undefined;
  readonly raceMs: number;
  readonly row: readonly number[];
}

const connectionsOf = (trace: RiderTraceFile): readonly PlacedRow[][] =>
  trace.connections.map((connection) => {
    const own = chunks(connection, TRACE_ROW_FIELDS);
    const raceStartMs = Math.max(
      ...own.map(
        (row) =>
          (row[TraceField.tick] ?? 0) * TICK_MS - (row[TraceField.atMs] ?? 0)
      )
    );
    return own.map((row, at) => ({
      before: own[at - 1],
      raceMs: (row[TraceField.atMs] ?? 0) + raceStartMs,
      row,
    }));
  });

const momentsOf = (
  { rider, trace }: RiderTrace,
  room: RoomTrace
): Map<number, Moment> => {
  const moments = new Map<number, Moment>();
  for (const { raceMs, row } of connectionsOf(trace).flat()) {
    const moment = momentAt(moments, Math.floor(raceMs / MS_PER_SECOND));
    moment.frameMs = Math.max(
      moment.frameMs,
      row[TraceField.worstFrameMs] ?? 0
    );
    moment.gapMs = Math.max(moment.gapMs, row[TraceField.worstTickGapMs] ?? 0);
    moment.rttMs = Math.max(moment.rttMs, row[TraceField.worstRttMs] ?? 0);
    moment.slowedMs += row[TraceField.slowedMs] ?? 0;
    moment.surged += row[TraceField.surgedFrames] ?? 0;
  }
  for (const [tick = 0, owner, missed = 0, late = 0] of chunks(
    room.rows,
    ROOM_TRACE_FIELDS
  )) {
    if (owner === rider) {
      const moment = momentAt(moments, secondOf(tick));
      moment.missed += missed;
      moment.late += late;
    }
  }
  return moments;
};

const stalled = ({ frameMs }: Moment): boolean => frameMs >= STALL_MS;
const gapped = ({ gapMs }: Moment): boolean => gapMs >= TICK_GAP_MS;
const missedAny = ({ missed }: Moment): boolean => missed > 0;
const offPace = ({ slowedMs, surged }: Moment): boolean =>
  slowedMs > 0 || surged > 0;
const isBad = (moment: Moment): boolean =>
  stalled(moment) || gapped(moment) || missedAny(moment) || offPace(moment);

const clockOf = (second: number): string =>
  `${Math.floor(second / SECONDS_IN_MINUTE)}:${String(second % SECONDS_IN_MINUTE).padStart(CLOCK_DIGITS, "0")}`;

const momentText = (rider: number, moment: Moment | undefined): string =>
  moment
    ? `rider ${rider} frame ${moment.frameMs} ms, tick gap ${moment.gapMs} ms, round trip ${moment.rttMs} ms, slowed ${moment.slowedMs} ms, surged ${moment.surged}, missed ${moment.missed}, late ${moment.late}`
    : `rider ${rider} no row`;

const gapCauses = ["browser", "spike", "steady", "unmeasured"] as const;
type GapCause = (typeof gapCauses)[number];

interface TickGap {
  readonly cause: GapCause;
  readonly ms: number;
}

interface RiderStalls {
  readonly gaps: readonly TickGap[];
  readonly raceMs: number;
}

const field = (row: readonly number[] | undefined, at: number): number =>
  row?.[at] ?? 0;

const rankOf = (sorted: readonly number[], share: number): number =>
  sorted[Math.max(0, Math.ceil(sorted.length * share) - 1)] ?? 0;

const causeOf = (
  row: readonly number[],
  before: readonly number[] | undefined,
  typicalRttMs: number
): GapCause => {
  const frameMs = Math.max(
    field(row, TraceField.worstFrameMs),
    field(before, TraceField.worstFrameMs)
  );
  if (frameMs * 2 >= field(row, TraceField.worstTickGapMs)) {
    return "browser";
  }
  const rttMs = field(row, TraceField.worstRttMs);
  if (rttMs === 0) {
    return "unmeasured";
  }
  return rttMs - typicalRttMs >= ROUND_TRIP_SPIKE_MS ? "spike" : "steady";
};

const stallsOf = (trace: RiderTraceFile): RiderStalls => {
  const connections = connectionsOf(trace);
  const gaps = connections.flatMap((placed) => {
    const typicalRttMs = rankOf(
      placed
        .map(({ row }) => field(row, TraceField.worstRttMs))
        .filter((rttMs) => rttMs > 0)
        .toSorted((left, right) => left - right),
      P50
    );
    return placed.flatMap(({ before, row }) => {
      const ms = field(row, TraceField.worstTickGapMs);
      return ms >= GAP_FLOORS_MS[0]
        ? [{ cause: causeOf(row, before, typicalRttMs), ms }]
        : [];
    });
  });
  const raceMs = connections.reduce(
    (total, placed) => total + field(placed.at(-1)?.row, TraceField.atMs),
    0
  );
  return { gaps, raceMs };
};

const causeText = (cause: GapCause): string => {
  switch (cause) {
    case "browser": {
      return "while the browser froze";
    }
    case "spike": {
      return "on the link with a round-trip spike";
    }
    case "steady": {
      return "on the link with a steady round trip";
    }
    case "unmeasured": {
      return "on the link with no round trip measured";
    }
    default: {
      return cause satisfies never;
    }
  }
};

const msOf = (gaps: readonly TickGap[]): number =>
  gaps.reduce((total, gap) => total + gap.ms, 0);

const atLeast = (gaps: readonly TickGap[], floorMs: number): TickGap[] =>
  gaps.filter((gap) => gap.ms >= floorMs);

const onLink = (gaps: readonly TickGap[]): TickGap[] =>
  atLeast(gaps, TICK_GAP_MS).filter((gap) => gap.cause !== "browser");

const linkShare = ({ gaps, raceMs }: RiderStalls): number =>
  raceMs === 0 ? 0 : msOf(onLink(gaps)) / raceMs;

const shareText = (share: number): string =>
  `${(share * PERCENT).toFixed(PERCENT_DIGITS)}%`;

const percentOf = (ms: number, totalMs: number): string =>
  shareText(totalMs === 0 ? 0 : ms / totalMs);

const floorList = listOf.format(GAP_FLOORS_MS.map(String));

const sharesText = (gaps: readonly TickGap[], raceMs: number): string =>
  listOf.format(
    GAP_FLOORS_MS.map((floorMs) =>
      percentOf(msOf(atLeast(gaps, floorMs)), raceMs)
    )
  );

const stallLine = (stalls: RiderStalls): string => {
  const { gaps, raceMs } = stalls;
  const minutes = raceMs / MS_PER_MINUTE;
  const counted = atLeast(gaps, TICK_GAP_MS);
  const byCause = gapCauses.map(
    (cause) =>
      `${counted.filter((gap) => gap.cause === cause).length} ${causeText(cause)}`
  );
  const perMinute = GAP_FLOORS_MS.map((floorMs) =>
    (minutes === 0 ? 0 : atLeast(gaps, floorMs).length / minutes).toFixed(1)
  );
  return `Raced ${clockOf(Math.round(raceMs / MS_PER_SECOND))}. Rows whose worst tick gap reached ${floorList} ms came ${listOf.format(perMinute)} times a minute, and those gaps took ${sharesText(gaps, raceMs)} of the race. Of ${counted.length} rows with a gap of ${TICK_GAP_MS} ms or more, ${listOf.format(byCause)}. Link gaps of ${TICK_GAP_MS} ms or more took ${shareText(linkShare(stalls))} of the race.`;
};

const stallSummary = (
  everyone: readonly RiderStalls[],
  races: number
): string => {
  const shares = everyone
    .map(linkShare)
    .toSorted((left, right) => left - right);
  const under = shares.filter((share) => share < UNDER_SHARE).length;
  const raceMs = everyone.reduce((total, stalls) => total + stalls.raceMs, 0);
  const gaps = everyone.flatMap((stalls) => stalls.gaps);
  const counted = atLeast(gaps, TICK_GAP_MS);
  const byCause = gapCauses.map(
    (cause) =>
      `${percentOf(msOf(counted.filter((gap) => gap.cause === cause)), raceMs)} ${causeText(cause)}`
  );
  return `${everyone.length} riders in ${races} races raced ${clockOf(Math.round(raceMs / MS_PER_SECOND))} in all. Link gaps of ${TICK_GAP_MS} ms or more took under ${shareText(UNDER_SHARE)} of the race for ${under} of ${everyone.length} riders. Their share was ${shareText(rankOf(shares, P50))} at the median, ${shareText(rankOf(shares, P90))} at the 90th percentile and ${shareText(shares.at(-1) ?? 0)} at worst. Over all racing, tick gaps of ${floorList} ms or more took ${sharesText(gaps, raceMs)} of the time. Gaps of ${TICK_GAP_MS} ms or more split into ${listOf.format(byCause)}.`;
};

export const traceReport = (
  riders: readonly RiderTrace[],
  room: RoomTrace
): string => {
  const timelines = riders.map((rider) => ({
    moments: momentsOf(rider, room),
    rider,
  }));
  const riderLines = timelines.map(({ moments, rider }) => {
    const all = [...moments.values()];
    return `Rider ${rider.rider}: build ${rider.trace.build}, ${rider.trace.gpu}, ${rider.trace.graphics}. Browser stalls in ${all.filter(stalled).length} s, missed controls in ${all.filter(missedAny).length} s, slowed or surged in ${all.filter(offPace).length} s. ${stallLine(stallsOf(rider.trace))}`;
  });
  const seconds = [
    ...new Set(timelines.flatMap(({ moments }) => [...moments.keys()])),
  ].toSorted((left, right) => left - right);
  const everyoneMissed = seconds.filter(
    (second) =>
      timelines.length > 1 &&
      timelines.every(({ moments }) => {
        const moment = moments.get(second);
        return moment !== undefined && missedAny(moment);
      })
  );
  const badLines = seconds
    .filter((second) =>
      timelines.some(({ moments }) => {
        const moment = moments.get(second);
        return moment !== undefined && isBad(moment);
      })
    )
    .map(
      (second) =>
        `  ${clockOf(second)}  ${timelines.map(({ moments, rider }) => momentText(rider.rider, moments.get(second))).join(" | ")}`
    );
  return [
    ...riderLines,
    `Every rider missed controls in the same second ${everyoneMissed.length} time(s).`,
    "Seconds with a stall, a tick gap, a missed control, a slowdown or a surge, on the race's clock:",
    ...badLines,
  ].join("\n");
};

const readRiders = Effect.fn("rooms.trace.riders")(function* readRiders(
  dir: string
) {
  const files = yield* FileSystem.FileSystem;
  const names = yield* files
    .readDirectory(dir)
    .pipe(Effect.mapError(failed(`Could not read ${dir}.`)));
  const riders: RiderTrace[] = [];
  for (const name of names.toSorted()) {
    const rider = RIDER_FILE.exec(name)?.groups?.rider;
    if (rider !== undefined) {
      const trace = yield* files
        .readFileString(`${dir}/${name}`)
        .pipe(
          Effect.flatMap(decodeBrowser),
          Effect.mapError(
            failed(
              `${name} is not a version ${TRACE_VERSION} browser trace, so an older build wrote its columns.`
            )
          )
        );
      riders.push({ rider: Number(rider), trace });
    }
  }
  return riders;
});

const noTrace = (dir: string, skipped: readonly string[]) =>
  new TraceReadFailed({
    message: [
      `No browser trace in ${dir}. Race data may be off, or the seat was scripted.`,
      ...skipped,
    ].join("\n"),
  });

const raceReport = Effect.fn("rooms.trace.race")(function* raceReport(
  dir: string
) {
  const files = yield* FileSystem.FileSystem;
  const room = yield* files
    .readFileString(`${dir}/${roomTraceName}`)
    .pipe(
      Effect.flatMap(decodeRoom),
      Effect.mapError(failed(`No readable ${roomTraceName} in ${dir}.`))
    );
  const riders = yield* readRiders(dir);
  if (riders.length === 0) {
    return yield* noTrace(dir, []);
  }
  return traceReport(riders, room);
});

const racesReport = Effect.fn("rooms.trace.races")(function* racesReport(
  folder: string
) {
  const files = yield* FileSystem.FileSystem;
  const names = yield* files
    .readDirectory(folder)
    .pipe(Effect.mapError(failed(`Could not read ${folder}.`)));
  const lines: string[] = [];
  const skipped: string[] = [];
  const everyone: RiderStalls[] = [];
  let races = 0;
  for (const name of names.toSorted()) {
    const dir = `${folder}/${name}`;
    const info = yield* files
      .stat(dir)
      .pipe(Effect.mapError(failed(`Could not read ${dir}.`)));
    const read =
      info.type === "Directory"
        ? yield* Effect.result(readRiders(dir))
        : Result.succeed([]);
    if (Result.isFailure(read)) {
      skipped.push(`Skipped ${name}: ${read.failure.message}`);
      continue;
    }
    const riders = read.success;
    races += riders.length > 0 ? 1 : 0;
    for (const { rider, trace } of riders) {
      const stalls = stallsOf(trace);
      everyone.push(stalls);
      lines.push(
        `${name} rider ${rider}, build ${trace.build}: ${stallLine(stalls)}`
      );
    }
  }
  if (everyone.length === 0) {
    return yield* noTrace(folder, skipped);
  }
  return [...lines, stallSummary(everyone, races), ...skipped].join("\n");
});

export const main = Effect.fn("rooms.trace")(function* main(
  args: readonly string[]
) {
  const { dir, races } = parseArgs({
    args: [...args],
    options: { dir: { type: "string" }, races: { type: "string" } },
  }).values;
  if (dir !== undefined && races === undefined) {
    return yield* Console.log(yield* raceReport(dir));
  }
  if (races !== undefined && dir === undefined) {
    return yield* Console.log(yield* racesReport(races));
  }
  return yield* new TraceReadFailed({ message: USAGE });
});
