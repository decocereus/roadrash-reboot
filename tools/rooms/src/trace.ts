import { parseArgs } from "node:util";

import {
  ROOM_TRACE_FIELDS,
  roomTraceName,
  RiderTraceSchema,
  RoomTraceSchema,
  TRACE_ROW_FIELDS,
  TraceField,
} from "@racer/rooms/tape";
import type { RiderTraceFile, RoomTrace } from "@racer/rooms/tape";
import { TICK_SECONDS } from "@racer/sim/state";
import * as Console from "effect/Console";
import * as Data from "effect/Data";
import * as Effect from "effect/Effect";
import * as FileSystem from "effect/FileSystem";
import * as Schema from "effect/Schema";

const USAGE = "Usage: pnpm rooms:trace --dir <folder holding one race's tape>";
const RIDER_FILE = /^rider-(?<rider>\d+)\.trace\.json$/u;
const STALL_MS = 50;
const TICK_GAP_MS = 100;
const SECONDS_IN_MINUTE = 60;
const MS_PER_SECOND = 1000;
const TICK_MS = TICK_SECONDS * MS_PER_SECOND;
const CLOCK_DIGITS = 2;

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

const momentsOf = (
  { rider, trace }: RiderTrace,
  room: RoomTrace
): Map<number, Moment> => {
  const moments = new Map<number, Moment>();
  const rows = trace.connections.flatMap((connection) => {
    const own = chunks(connection, TRACE_ROW_FIELDS);
    const raceStartMs = Math.max(
      ...own.map(
        (row) =>
          (row[TraceField.tick] ?? 0) * TICK_MS - (row[TraceField.atMs] ?? 0)
      )
    );
    return own.map((row) => ({ raceStartMs, row }));
  });
  for (const { raceStartMs, row } of rows) {
    const moment = momentAt(
      moments,
      Math.floor(((row[TraceField.atMs] ?? 0) + raceStartMs) / MS_PER_SECOND)
    );
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
const stallNear = (moments: Map<number, Moment>, second: number): boolean =>
  [second - 1, second, second + 1].some((near) => {
    const moment = moments.get(near);
    return moment !== undefined && stalled(moment);
  });
const isBad = (moment: Moment): boolean =>
  stalled(moment) || gapped(moment) || missedAny(moment);

const clockOf = (second: number): string =>
  `${Math.floor(second / SECONDS_IN_MINUTE)}:${String(second % SECONDS_IN_MINUTE).padStart(CLOCK_DIGITS, "0")}`;

const momentText = (rider: number, moment: Moment | undefined): string =>
  moment
    ? `rider ${rider} frame ${moment.frameMs} ms, tick gap ${moment.gapMs} ms, round trip ${moment.rttMs} ms, slowed ${moment.slowedMs} ms, surged ${moment.surged}, missed ${moment.missed}, late ${moment.late}`
    : `rider ${rider} no row`;

export const traceReport = (
  riders: readonly RiderTrace[],
  room: RoomTrace
): string => {
  const timelines = riders.map((rider) => ({
    moments: momentsOf(rider, room),
    rider,
  }));
  const riderLines = timelines.map(({ moments, rider }) => {
    const all = [...moments.entries()];
    const count = (wanted: (second: number, moment: Moment) => boolean) =>
      all.filter(([second, moment]) => wanted(second, moment)).length;
    const nearStall = count(
      (second, moment) => gapped(moment) && stallNear(moments, second)
    );
    const alone = count(
      (second, moment) => gapped(moment) && !stallNear(moments, second)
    );
    return `Rider ${rider.rider}: build ${rider.trace.build}, ${rider.trace.gpu}, ${rider.trace.graphics}. Browser stalls in ${count((_, moment) => stalled(moment))} s, tick gaps within a second of a stall in ${nearStall} s, tick gaps with no stall near in ${alone} s, missed controls in ${count((_, moment) => missedAny(moment))} s.`;
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
    "Seconds with a stall, a tick gap or a missed control, on the race's clock:",
    ...badLines,
  ].join("\n");
};

export const main = Effect.fn("rooms.trace")(function* main(
  args: readonly string[]
) {
  const { dir } = parseArgs({
    args: [...args],
    options: { dir: { type: "string" } },
  }).values;
  if (dir === undefined) {
    return yield* new TraceReadFailed({ message: USAGE });
  }
  const files = yield* FileSystem.FileSystem;
  const room = yield* files
    .readFileString(`${dir}/${roomTraceName}`)
    .pipe(
      Effect.flatMap(decodeRoom),
      Effect.mapError(failed(`No readable ${roomTraceName} in ${dir}.`))
    );
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
          Effect.mapError(failed(`${name} is not a browser trace.`))
        );
      riders.push({ rider: Number(rider), trace });
    }
  }
  if (riders.length === 0) {
    return yield* new TraceReadFailed({
      message: `No browser trace in ${dir}. Race data may be off, or the seat was scripted.`,
    });
  }
  return yield* Console.log(traceReport(riders, room));
});
