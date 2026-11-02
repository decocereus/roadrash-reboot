import { parseArgs } from "node:util";

import { UsageError } from "@racer/devtools/usage-error";
import { RaceIdSchema, RoomApi } from "@racer/rooms/contract";
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
  "Usage: pnpm rooms:race --url http://127.0.0.1:<port> [--seats 2] [--seconds 20] [--lobby-seconds 0] [--drop-at-seconds n]";

const POLL_MS = 50;
const OPEN_TIMEOUT_MS = 15_000;
const START_DELAY_SECONDS = 3;
const LOWEST_TICK_SHARE = 0.97;

class RoomRaceFailed extends Data.TaggedError("RoomRaceFailed")<{
  readonly message: string;
}> {}

const makeRaceId = Schema.decodeUnknownSync(RaceIdSchema);

const options = (args: readonly string[]) =>
  Effect.try({
    catch: (cause) => new UsageError({ message: `${String(cause)}\n${usage}` }),
    try: () =>
      parseArgs({
        args: [...args],
        options: {
          "drop-at-seconds": { type: "string" },
          "lobby-seconds": { default: "0", type: "string" },
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

const refusalOf = (socketUrl: string) =>
  Effect.gen(function* refusal() {
    const seat = openSeat(socketUrl);
    yield* waitFor(seat.over, "a refused seat to close", OPEN_TIMEOUT_MS);
    return seat.report().refused;
  });

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

interface ContractAnswers {
  readonly badPath: number;
  readonly idle: string;
  readonly late: string | null;
  readonly ninth: string | null;
  readonly other: { readonly phase: string; readonly seats: number };
  readonly plain: number;
}

const contractProblems = (answers: ContractAnswers): readonly string[] => {
  const { badPath, idle, late, ninth, other, plain } = answers;
  return [
    ...(ninth === "full" ? [] : [`A ninth seat was refused as ${ninth}.`]),
    ...(late === "racing" ? [] : [`A late seat was refused as ${late}.`]),
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
  const lobbySeconds = Number(values["lobby-seconds"]);
  const stamp = (yield* Clock.currentTimeMillis).toString(36);
  const raceId = makeRaceId(`verify-${stamp}`);
  const client = yield* HttpApiClient.make(RoomApi, { baseUrl: url });
  const idle = yield* client.rooms.status({ params: { raceId } });
  const http = yield* HttpClient.HttpClient;
  const plain = yield* http.get(`${url}/rooms/${raceId}/seat`);
  const badPath = yield* http.get(`${url}/rooms/NOT_A_ROOM/seat`);

  const socketUrl = `${url.replace(/^http/u, "ws")}/rooms/${raceId}/seat`;
  const seats = Array.from({ length: seatCount }, () => openSeat(socketUrl));
  yield* waitFor(
    () => seats.every((seat) => seat.opened()),
    "every seat to open",
    OPEN_TIMEOUT_MS
  );
  yield* waitFor(
    () => seats.every((seat) => seat.seatsSeen() === seatCount),
    "every seat to hear the full lobby",
    OPEN_TIMEOUT_MS
  );
  const ninth = seatCount === MOST_SEATS ? yield* refusalOf(socketUrl) : "full";
  yield* Effect.sleep(lobbySeconds * 1000);
  const [first] = seats;
  const last = seats.at(-1);
  if (!first || !last) {
    return yield* new UsageError({ message: usage });
  }
  first.start();
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
  const late = yield* refusalOf(socketUrl);
  const other = yield* client.rooms.status({
    params: { raceId: makeRaceId(`other-${stamp}`) },
  });
  yield* rideUntil(seats, START_DELAY_SECONDS + seconds, drop);
  const status = yield* client.rooms.status({ params: { raceId } });
  const reports = seats.map((seat) => seat.report());
  for (const seat of seats) {
    if (!seat.over()) {
      seat.leave();
    }
  }
  const problems = [
    ...problemsOf(drop ? reports.slice(0, -1) : reports, seconds),
    ...contractProblems({
      badPath: badPath.status,
      idle: idle.phase,
      late,
      ninth,
      other: { phase: other.phase, seats: other.seats.length },
      plain: plain.status,
    }),
  ];
  yield* Effect.log(
    JSON.stringify({ problems, raceId, reports, status }, null, 2)
  );
  return yield* problems.length > 0
    ? Effect.fail(new RoomRaceFailed({ message: problems.join(" ") }))
    : Effect.void;
});
