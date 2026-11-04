import { parseArgs } from "node:util";

import { UsageError } from "@racer/devtools/usage-error";
import { RoomIdSchema, RoomApi } from "@racer/rooms/contract";
import { MOST_SEATS } from "@racer/sim/room";
import * as Clock from "effect/Clock";
import * as Data from "effect/Data";
import * as Effect from "effect/Effect";
import * as HttpApiClient from "effect/http-api/HttpApiClient";
import * as HttpClient from "effect/http/HttpClient";
import * as Schema from "effect/Schema";

import { openSeat } from "./seat.ts";
import type { Seat, SeatReport } from "./seat.ts";

const usage =
  "Usage: pnpm rooms:race --url http://127.0.0.1:<port> [--seats 2] [--seconds 20] [--drop-at-seconds n]";

const POLL_MS = 50;
const OPEN_TIMEOUT_MS = 15_000;
const START_DELAY_SECONDS = 3;
const LOWEST_TICK_SHARE = 0.97;
const MOST_MISSED_SHARE = 0.02;
const NEVER_READY = Number.POSITIVE_INFINITY;

class RoomRaceFailed extends Data.TaggedError("RoomRaceFailed")<{
  readonly message: string;
}> {}

const makeRoomId = Schema.decodeUnknownSync(RoomIdSchema);

const options = (args: readonly string[]) =>
  Effect.try({
    catch: (cause) => new UsageError({ message: `${String(cause)}\n${usage}` }),
    try: () =>
      parseArgs({
        args: [...args],
        options: {
          "drop-at-seconds": { type: "string" },
          seats: { default: "2", type: "string" },
          seconds: { default: "20", type: "string" },
          url: { type: "string" },
        },
      }).values,
  });

const waitFor = (test: () => boolean, what: string, timeoutMs: number) =>
  Effect.gen(function* waiting() {
    const from = yield* Clock.currentTimeMillis;
    while (!test()) {
      if ((yield* Clock.currentTimeMillis) - from > timeoutMs) {
        yield* new RoomRaceFailed({ message: `Timed out: ${what}.` });
      }
      yield* Effect.sleep(POLL_MS);
    }
  });

const refusalOf = (url: string, roomId: string, build: string) =>
  Effect.gen(function* refusal() {
    const seat = openSeat(url, roomId, build, NEVER_READY);
    yield* waitFor(seat.over, "a refused seat to close", OPEN_TIMEOUT_MS);
    return seat.report().refused;
  });

const lateSeatAnswer = (url: string, roomId: string, build: string) =>
  Effect.gen(function* lateAnswer() {
    const seat = openSeat(url, roomId, build, NEVER_READY);
    yield* waitFor(seat.opened, "a late seat to open", OPEN_TIMEOUT_MS);
    const { refused } = seat.report();
    seat.leave();
    return refused;
  });

const raceIdProblems = (
  reports: readonly SeatReport[],
  current: string | null
): readonly string[] => {
  const raceIds = new Set(reports.map((report) => report.raceId));
  if (raceIds.size !== 1 || raceIds.has(null)) {
    return [`The seats did not share one race ID: ${[...raceIds].join(", ")}.`];
  }
  return current === null || raceIds.has(current)
    ? []
    : [`The seats' race ID is not the room's, ${current}.`];
};

const problemsOf = (
  reports: readonly SeatReport[],
  seconds: number
): readonly string[] =>
  reports.flatMap((report) => {
    const problems: string[] = [];
    if (!report.digestMatched) {
      problems.push(
        `Rider ${report.you} built a different race from the room.`
      );
    }
    if (report.desyncs > 0) {
      problems.push(`Rider ${report.you} desynced ${report.desyncs} times.`);
    }
    if (report.hashesCompared === 0) {
      problems.push(`Rider ${report.you} compared no room hash.`);
    }
    const expected = seconds * 60 * LOWEST_TICK_SHARE;
    if (!report.ended && report.ticks < expected) {
      problems.push(
        `Rider ${report.you} confirmed ${report.ticks} ticks, under ${Math.floor(expected)}.`
      );
    }
    return problems;
  });

const missedProblems = (
  tick: number,
  seats: readonly { readonly missed: number; readonly rider: number }[]
): readonly string[] =>
  seats.flatMap(({ missed, rider }) =>
    missed > tick * MOST_MISSED_SHARE
      ? [`Rider ${rider} rode ${missed} of ${tick} ticks with no control.`]
      : []
  );

interface ContractAnswers {
  readonly badPath: number;
  readonly idle: string;
  readonly late: string | null;
  readonly lateExpected: string | null;
  readonly ninth: string | null;
  readonly other: { readonly phase: string; readonly seats: number };
  readonly plain: number;
  readonly stale: string | null;
}

const contractProblems = (answers: ContractAnswers): readonly string[] => {
  const { badPath, idle, late, lateExpected, ninth, other, plain, stale } =
    answers;
  return [
    ...(ninth === "full" ? [] : [`A ninth seat was refused as ${ninth}.`]),
    ...(late === lateExpected
      ? []
      : [`A late seat answered ${late}, not ${lateExpected}.`]),
    ...(stale === "build" ? [] : [`An old build was refused as ${stale}.`]),
    ...(other.phase === "waiting" && other.seats === 0
      ? []
      : [`Another race id reached a room with ${other.seats} seats.`]),
    ...(idle === "waiting"
      ? []
      : [`A new room answered ${idle}, not waiting.`]),
    ...(plain === 426
      ? []
      : [`A plain request to a seat answered ${plain}, not 426.`]),
    ...(badPath === 404
      ? []
      : [`A malformed race id answered ${badPath}, not 404.`]),
  ];
};

const rideUntil = (
  seats: readonly Seat[],
  endSeconds: number,
  drop: { readonly atSeconds: number; readonly seat: Seat } | null
) =>
  Effect.gen(function* riding() {
    const startedAt = yield* Clock.currentTimeMillis;
    let left = false;
    let racing = true;
    while (racing) {
      const now = yield* Clock.currentTimeMillis;
      const at = (now - startedAt) / 1000;
      if (drop && !left && at > drop.atSeconds) {
        drop.seat.leave();
        left = true;
      }
      racing = at < endSeconds && !seats.every((seat) => seat.over());
      yield* Effect.sleep(POLL_MS);
    }
  });

export const main = Effect.fn("rooms.race")(function* main(
  args: readonly string[]
) {
  const values = yield* options(args);
  const { url } = values;
  if (url === undefined) {
    return yield* new UsageError({ message: usage });
  }
  const seatCount = Number(values.seats);
  const seconds = Number(values.seconds);
  const stamp = (yield* Clock.currentTimeMillis).toString(36);
  const roomId = makeRoomId(`verify-${stamp}`);
  const client = yield* HttpApiClient.make(RoomApi, { baseUrl: url });
  const idle = yield* client.rooms.status({ params: { roomId } });
  const http = yield* HttpClient.HttpClient;
  const plain = yield* http.get(`${url}/rooms/${roomId}/seat`);
  const badPath = yield* http.get(`${url}/rooms/NOT_A_ROOM/seat`);

  const { build } = idle;
  const seats = Array.from({ length: seatCount }, () =>
    openSeat(url, roomId, build, seatCount)
  );
  yield* waitFor(
    () => seats.every((seat) => seat.opened()),
    "every seat to open",
    OPEN_TIMEOUT_MS
  );
  const joiningFrom = yield* Clock.currentTimeMillis;
  while (
    (yield* client.rooms.status({ params: { roomId } })).waiting < seatCount
  ) {
    if ((yield* Clock.currentTimeMillis) - joiningFrom > OPEN_TIMEOUT_MS) {
      yield* new RoomRaceFailed({ message: "Timed out: seats joining." });
    }
    yield* Effect.sleep(POLL_MS);
  }
  const ninth =
    seatCount === MOST_SEATS ? yield* refusalOf(url, roomId, build) : "full";
  const stale = yield* refusalOf(url, roomId, `not-${build}`);
  const last = seats.at(-1);
  if (!last) {
    return yield* new UsageError({ message: usage });
  }
  const dropAt = values["drop-at-seconds"];
  const drop =
    dropAt === undefined
      ? null
      : { atSeconds: START_DELAY_SECONDS + Number(dropAt), seat: last };
  yield* waitFor(
    () => seats.every((seat) => seat.started()),
    "every seat to hear the start",
    OPEN_TIMEOUT_MS
  );
  const late = yield* lateSeatAnswer(url, roomId, build);
  const other = yield* client.rooms.status({
    params: { roomId: makeRoomId(`other-${stamp}`) },
  });
  yield* rideUntil(seats, START_DELAY_SECONDS + seconds, drop);
  const status = yield* client.rooms.status({ params: { roomId } });
  const reports = seats.map((seat) => seat.report());
  for (const seat of seats) {
    if (!seat.over()) {
      seat.leave();
    }
  }
  const problems = [
    ...problemsOf(drop ? reports.slice(0, -1) : reports, seconds),
    ...missedProblems(status.tick, status.seats),
    ...raceIdProblems(reports, status.raceId),
    ...contractProblems({
      badPath: badPath.status,
      idle: idle.phase,
      late,
      lateExpected: seatCount === MOST_SEATS ? "full" : null,
      ninth,
      other: { phase: other.phase, seats: other.seats.length },
      plain: plain.status,
      stale,
    }),
  ];
  yield* Effect.log(
    JSON.stringify({ problems, reports, roomId, status }, null, 2)
  );
  return yield* problems.length > 0
    ? Effect.fail(new RoomRaceFailed({ message: problems.join(" ") }))
    : Effect.void;
});
