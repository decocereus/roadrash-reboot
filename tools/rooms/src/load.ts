import { parseArgs } from "node:util";

import { ToolProcesses } from "@racer/devtools/process";
import { UsageError } from "@racer/devtools/usage-error";
import { RoomIdSchema, RoomApi } from "@racer/rooms/contract";
import * as Clock from "effect/Clock";
import * as Console from "effect/Console";
import * as Effect from "effect/Effect";
import * as HttpApiClient from "effect/http-api/HttpApiClient";
import * as Schema from "effect/Schema";

import { decodeClientResult, encodeClientPlan } from "./load-plan.ts";
import type { ClientPlan, SeatPlan } from "./load-plan.ts";
import { stepReport } from "./load-report.ts";
import type { Sample, StepReport } from "./load-report.ts";
import {
  oneMinuteLoad,
  readProcesses,
  sleepUntil,
  workerdOn,
} from "./machine.ts";

const usage =
  "Usage: pnpm rooms:load --url <workerd or deployed rooms url> --rooms 2,4,8 [--seats 4] [--seconds 20] [--input-hz 60] [--full-seats 2] [--warm-seconds 5] [--settle-seconds 20] [--most-load 10] [--most-messages n] [--plan]";

const CLIENT_ENTRY = new URL("../load-clients.ts", import.meta.url).pathname;
const START_DELAY_SECONDS = 3;
const FULL_SEAT_HZ = 60;
const LEAST_OPEN_MS = 2000;
const OPEN_MS_PER_SEAT = 5;
const LAST_SAMPLE_BEFORE_END_MS = 400;
const SEATS_PER_CLIENT = 60;
const TICKS_PER_SECOND = 60;
const PINGS_PER_SECOND = 2;
const GB_PER_ROOM = 0.128;
const INCOMING_MESSAGES_PER_BILLED_REQUEST = 20;
const STATUS_READS_PER_ROOM = 2;
const LOOPBACK_HOSTS = new Set(["127.0.0.1", "localhost"]);

const makeRoomId = Schema.decodeUnknownSync(RoomIdSchema);

interface LoadOptions {
  readonly fullSeats: number;
  readonly inputHz: number;
  readonly mostLoad: number;
  readonly mostMessages: number | null;
  readonly roomSteps: readonly number[];
  readonly seats: number;
  readonly seconds: number;
  readonly settleSeconds: number;
  readonly url: string;
  readonly warmSeconds: number;
}

const options = (args: readonly string[]) =>
  Effect.try({
    catch: (cause) => new UsageError({ message: `${String(cause)}\n${usage}` }),
    try: () =>
      parseArgs({
        args: [...args],
        options: {
          "full-seats": { default: "2", type: "string" },
          "input-hz": { default: "60", type: "string" },
          "most-load": { default: "10", type: "string" },
          "most-messages": { type: "string" },
          plan: { default: false, type: "boolean" },
          rooms: { type: "string" },
          seats: { default: "4", type: "string" },
          seconds: { default: "20", type: "string" },
          "settle-seconds": { default: "20", type: "string" },
          url: { type: "string" },
          "warm-seconds": { default: "5", type: "string" },
        },
      }).values,
  });

const rideSecondsOf = (load: LoadOptions): number =>
  load.warmSeconds + load.seconds;

const planOf = (load: LoadOptions, rooms: number) => {
  const seats = rooms * load.seats;
  const ride = rideSecondsOf(load);
  const full = Math.min(rooms, load.fullSeats);
  const incoming =
    ((seats - full) * load.inputHz +
      full * FULL_SEAT_HZ +
      seats * PINGS_PER_SECOND) *
    (ride + START_DELAY_SECONDS);
  const requests = seats + rooms * STATUS_READS_PER_ROOM;
  return {
    connections: seats,
    gbSeconds: rooms * GB_PER_ROOM * (ride + START_DELAY_SECONDS),
    incomingMessages: incoming,
    requestsCountedOneToOne: requests + incoming,
    requestsCountedTwentyToOne:
      requests + incoming / INCOMING_MESSAGES_PER_BILLED_REQUEST,
    rideSeconds: ride,
    rooms,
    seats,
  };
};

const seatPlans = (
  load: LoadOptions,
  rooms: number,
  stamp: string
): readonly SeatPlan[] =>
  Array.from({ length: rooms }, (_, room) => room).flatMap((room) =>
    Array.from({ length: load.seats }, (_, seat) => ({
      full: room < load.fullSeats && seat === load.seats - 1,
      opener: seat === 0,
      roomId: `load-${stamp}-${room}`,
    }))
  );

const inChunks = <Item>(
  items: readonly Item[],
  size: number
): readonly (readonly Item[])[] =>
  Array.from({ length: Math.ceil(items.length / size) }, (_, chunk) =>
    items.slice(chunk * size, (chunk + 1) * size)
  );

const runClient = Effect.fn("rooms.load.client")(function* runClient(
  plan: ClientPlan
) {
  const processes = yield* ToolProcesses;
  const { stdout } = yield* processes.run("node", [
    CLIENT_ENTRY,
    encodeClientPlan(plan),
  ]);
  return yield* decodeClientResult(stdout.trim());
});

const runStep = Effect.fn("rooms.load.step")(function* runStep(
  load: LoadOptions,
  rooms: number,
  mostMessages: number,
  server: number | null
) {
  const client = yield* HttpApiClient.make(RoomApi, { baseUrl: load.url });
  const stamp = (yield* Clock.currentTimeMillis).toString(36);
  const seats = seatPlans(load, rooms, stamp);
  const roomIds = [...new Set(seats.map((seat) => seat.roomId))].map((id) =>
    makeRoomId(id)
  );
  const sample = Effect.gen(function* sample() {
    const at = yield* Clock.currentTimeMillis;
    const [processes, statuses] = yield* Effect.all(
      [
        readProcesses,
        Effect.all(
          roomIds.map((roomId) => client.rooms.status({ params: { roomId } })),
          { concurrency: "unbounded" }
        ),
      ],
      { concurrency: "unbounded" }
    );
    return { at, processes, statuses } satisfies Sample;
  });
  const now = yield* Clock.currentTimeMillis;
  const startAt = now + LEAST_OPEN_MS + seats.length * OPEN_MS_PER_SEAT;
  const raceAt = startAt + START_DELAY_SECONDS * 1000;
  const sampleFrom = raceAt + load.warmSeconds * 1000;
  const endAt = sampleFrom + load.seconds * 1000;
  const chunks = inChunks(seats, SEATS_PER_CLIENT);
  const loadBefore = oneMinuteLoad();
  const [clients, [first, second]] = yield* Effect.all(
    [
      Effect.all(
        chunks.map((chunk) =>
          runClient({
            endAt,
            inputEvery: Math.round(TICKS_PER_SECOND / load.inputHz),
            mostSent: Math.floor((mostMessages * chunk.length) / seats.length),
            seats: chunk,
            startAt,
            url: load.url,
          })
        ),
        { concurrency: "unbounded" }
      ),
      Effect.gen(function* samples() {
        yield* sleepUntil(sampleFrom);
        const opening = yield* sample;
        yield* sleepUntil(endAt - LAST_SAMPLE_BEFORE_END_MS);
        const closing = yield* sample;
        return [opening, closing] as const;
      }),
    ],
    { concurrency: "unbounded" }
  );
  return stepReport({
    clients,
    first,
    inputHz: load.inputHz,
    loadAfter: oneMinuteLoad(),
    loadBefore,
    mostLoad: load.mostLoad,
    raceAt,
    rideSeconds: rideSecondsOf(load),
    rooms,
    seats: load.seats,
    second,
    server,
  });
});

const summaryOf = (reports: readonly StepReport[]) => {
  const counted = reports.filter((report) => report.counted);
  return {
    firstMissedRooms: counted.find((report) => !report.held)?.rooms ?? null,
    mostHeldRooms: Math.max(
      0,
      ...counted.filter((report) => report.held).map((report) => report.rooms)
    ),
    stepsNotCounted: reports.length - counted.length,
  };
};

const loadOptionsOf = (values: Effect.Success<ReturnType<typeof options>>) =>
  Effect.gen(function* readLoadOptions() {
    const { rooms, url } = values;
    if (url === undefined || rooms === undefined) {
      return yield* new UsageError({ message: usage });
    }
    const cap = values["most-messages"];
    const load: LoadOptions = {
      fullSeats: Number(values["full-seats"]),
      inputHz: Number(values["input-hz"]),
      mostLoad: Number(values["most-load"]),
      mostMessages: cap === undefined ? null : Number(cap),
      roomSteps: rooms.split(",").map(Number),
      seats: Number(values.seats),
      seconds: Number(values.seconds),
      settleSeconds: Number(values["settle-seconds"]),
      url,
      warmSeconds: Number(values["warm-seconds"]),
    };
    return load;
  });

export const main = Effect.fn("rooms.load")(function* main(
  args: readonly string[]
) {
  const values = yield* options(args);
  const load = yield* loadOptionsOf(values);
  const plans = load.roomSteps.map((rooms) => planOf(load, rooms));
  const plannedMessages = plans.reduce(
    (total, plan) => total + plan.incomingMessages,
    0
  );
  const planned = JSON.stringify({ plannedMessages, plans });
  if (values.plan) {
    return yield* Console.log(planned);
  }
  yield* Console.log(planned);
  const local = LOOPBACK_HOSTS.has(new URL(load.url).hostname);
  if (!local && load.mostMessages === null) {
    return yield* new UsageError({
      message: `A run on the real network needs --most-messages.\n${usage}`,
    });
  }
  const cap = load.mostMessages ?? Number.MAX_SAFE_INTEGER;
  if (plannedMessages > cap) {
    return yield* new UsageError({
      message: `The plan sends ${plannedMessages} messages, over the cap of ${cap}.`,
    });
  }
  const server = yield* workerdOn(load.url);
  const reports: StepReport[] = [];
  let spent = 0;
  for (const rooms of load.roomSteps) {
    const report = yield* runStep(load, rooms, cap - spent, server);
    reports.push(report);
    spent += report.messagesSent;
    yield* Console.log(JSON.stringify(report));
    if (report.capped || (report.counted && !report.held)) {
      break;
    }
    yield* Effect.sleep(load.settleSeconds * 1000);
  }
  return yield* Console.log(
    JSON.stringify({ spent, summary: summaryOf(reports) })
  );
});
