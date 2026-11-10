import { parseArgs } from "node:util";

import { UsageError } from "@racer/devtools/usage-error";
import { RoomNoteSchema } from "@racer/rooms/notes";
import type { RoomNote } from "@racer/rooms/notes";
import * as Clock from "effect/Clock";
import * as Config from "effect/Config";
import * as Console from "effect/Console";
import * as Data from "effect/Data";
import * as Duration from "effect/Duration";
import * as Effect from "effect/Effect";
import * as FileSystem from "effect/FileSystem";
import * as Headers from "effect/http/Headers";
import * as HttpClient from "effect/http/HttpClient";
import * as HttpClientRequest from "effect/http/HttpClientRequest";
import * as HttpClientResponse from "effect/http/HttpClientResponse";
import * as Option from "effect/Option";
import * as Redacted from "effect/Redacted";
import * as Schema from "effect/Schema";

import { groupRaces, raceReport } from "./race-report.ts";

const usage =
  "Usage: pnpm rooms:read [--race <race id>] [--last 5] [--hours 24] [--script <worker name>] | --file <JSON lines>";

const ROOMS_ACCOUNT = "6979943b697a28951d44b9bcbcf61b42";
const PROD_ROOMS_SCRIPT = "rushline-rooms-prod-yzaffdxxtu73r6ek";
const MS_PER_HOUR = 3_600_000;
const MOST_EVENTS = 2000;
const SHORTEST_WINDOW_MS = 60_000;
const MOST_RATE_LIMIT_WAITS = 5;
const UNSTATED_RETRY_AFTER_SECONDS = 10;

class RoomReadFailed extends Data.TaggedError("RoomReadFailed")<{
  readonly cause?: unknown;
  readonly message: string;
}> {}

const options = (args: readonly string[]) =>
  Effect.try({
    catch: (cause) => new UsageError({ message: `${String(cause)}\n${usage}` }),
    try: () =>
      parseArgs({
        args: [...args],
        options: {
          file: { type: "string" },
          hours: { default: "24", type: "string" },
          last: { default: "5", type: "string" },
          race: { type: "string" },
          script: { default: PROD_ROOMS_SCRIPT, type: "string" },
        },
      }).values,
  });

const decodeNote = Schema.decodeUnknownOption(RoomNoteSchema);
const hasKind = Schema.is(Schema.Struct({ kind: Schema.String }));

interface NotesRead {
  readonly notes: readonly RoomNote[];
  readonly unread: number;
}

const notesOfValues = (values: readonly unknown[]): NotesRead => {
  const notes = values.flatMap((value) => Option.toArray(decodeNote(value)));
  return {
    notes,
    unread: values.filter(hasKind).length - notes.length,
  };
};

const jsonOfLine = (line: string): readonly unknown[] => {
  const from = line.indexOf("{");
  const to = line.lastIndexOf("}");
  if (from === -1 || to < from) {
    return [];
  }
  try {
    const parsed: unknown = JSON.parse(line.slice(from, to + 1));
    return [parsed];
  } catch {
    return [];
  }
};

export const notesOfLines = (text: string): NotesRead =>
  notesOfValues(text.split("\n").flatMap(jsonOfLine));

const QueryAnswer = Schema.Struct({
  result: Schema.Struct({
    events: Schema.Struct({
      events: Schema.Array(
        Schema.Struct({ source: Schema.Unknown, timestamp: Schema.Number })
      ),
    }),
    statistics: Schema.optionalKey(
      Schema.Struct({ abr_level: Schema.optionalKey(Schema.Number) })
    ),
  }),
});

type LoggedEvent =
  (typeof QueryAnswer.Type)["result"]["events"]["events"][number];

interface Timeframe {
  readonly from: number;
  readonly to: number;
}

const halvesOf = ({ from, to }: Timeframe): readonly [Timeframe, Timeframe] => {
  const middle = Math.floor((from + to) / 2);
  return [
    { from, to: middle + 1 },
    { from: middle, to },
  ];
};

const retryAfterOf = (
  response: HttpClientResponse.HttpClientResponse
): Duration.Duration => {
  const seconds = Number(
    Option.getOrElse(Headers.get(response.headers, "retry-after"), () => "")
  );
  return Duration.seconds(
    Number.isFinite(seconds) && seconds > 0
      ? seconds
      : UNSTATED_RETRY_AFTER_SECONDS
  );
};

const unreadable = (cause: unknown) =>
  new RoomReadFailed({
    cause,
    message: `Could not read the Workers logs: ${String(cause)}`,
  });

export const liveNotes = (script: string, hours: number) =>
  Effect.gen(function* live() {
    const token = yield* Config.Redacted("CLOUDFLARE_API_TOKEN");
    const account = yield* Config.String("CLOUDFLARE_ACCOUNT_ID").pipe(
      Config.withDefault(ROOMS_ACCOUNT)
    );
    const now = yield* Clock.currentTimeMillis;
    const client = yield* HttpClient.HttpClient;
    const ask = (timeframe: Timeframe) =>
      Effect.gen(function* askCloudflare() {
        const request = yield* HttpClientRequest.post(
          `https://api.cloudflare.com/client/v4/accounts/${account}/workers/observability/telemetry/query`
        ).pipe(
          HttpClientRequest.bearerToken(Redacted.value(token)),
          HttpClientRequest.bodyJson({
            dry: true,
            limit: MOST_EVENTS,
            parameters: {
              filters: [
                {
                  key: "$workers.scriptName",
                  operation: "eq",
                  type: "string",
                  value: script,
                },
                { key: "kind", operation: "exists", type: "string" },
              ],
            },
            queryId: "rushline-rooms-read",
            timeframe,
            view: "events",
          })
        );
        let response = yield* client.execute(request);
        for (
          let waits = 0;
          response.status === 429 && waits < MOST_RATE_LIMIT_WAITS;
          waits += 1
        ) {
          yield* Effect.sleep(retryAfterOf(response));
          response = yield* client.execute(request);
        }
        return yield* HttpClientResponse.schemaBodyJson(QueryAnswer)(
          yield* HttpClientResponse.filterStatusOk(response)
        );
      }).pipe(Effect.mapError(unreadable));
    const readWhole = (
      timeframe: Timeframe
    ): Effect.Effect<readonly LoggedEvent[], RoomReadFailed> =>
      Effect.gen(function* whole() {
        const { result } = yield* ask(timeframe);
        const { events } = result.events;
        const sampled = (result.statistics?.abr_level ?? 1) > 1;
        if (!sampled && events.length < MOST_EVENTS) {
          return events;
        }
        if (timeframe.to - timeframe.from < SHORTEST_WINDOW_MS) {
          return yield* new RoomReadFailed({
            message: `Cloudflare ${sampled ? "sampled" : `cut at ${MOST_EVENTS} lines`} its answer even for the ${Math.round((timeframe.to - timeframe.from) / 1000)} s after ${new Date(timeframe.from).toISOString()}, so the log cannot be read whole.`,
          });
        }
        const [earlier, later] = halvesOf(timeframe);
        return [...(yield* readWhole(earlier)), ...(yield* readWhole(later))];
      });
    const events = yield* readWhole({
      from: now - hours * MS_PER_HOUR,
      to: now,
    });
    return notesOfValues(
      events
        .toSorted((left, right) => left.timestamp - right.timestamp)
        .map(({ source }) => source)
    );
  }).pipe(
    Effect.catchTag("ConfigError", (cause) => Effect.fail(unreadable(cause)))
  );

export const main = Effect.fn("rooms.read")(function* main(
  args: readonly string[]
) {
  const { file, hours, last, race, script } = yield* options(args);
  const fileSystem = yield* FileSystem.FileSystem;
  const { notes, unread } =
    file === undefined
      ? yield* liveNotes(script, Number(hours))
      : notesOfLines(yield* fileSystem.readFileString(file));
  if (unread > 0) {
    yield* Console.warn(
      `${unread} room line(s) did not match RoomNoteSchema, so a race below may look incomplete.`
    );
  }
  const races = groupRaces(notes).filter(
    ({ raceId }) => race === undefined || raceId === race
  );
  if (races.length === 0) {
    return yield* new RoomReadFailed({ message: "No race lines found." });
  }
  return yield* Console.log(
    races.slice(-Number(last)).map(raceReport).join("\n\n")
  );
});
