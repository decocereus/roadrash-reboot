import { parseArgs } from "node:util";

import { UsageError } from "@racer/devtools/usage-error";
import { RoomNoteSchema } from "@racer/rooms/notes";
import type { RoomNote } from "@racer/rooms/notes";
import * as Clock from "effect/Clock";
import * as Config from "effect/Config";
import * as Console from "effect/Console";
import * as Data from "effect/Data";
import * as Effect from "effect/Effect";
import * as FileSystem from "effect/FileSystem";
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

export const notesOfLines = (text: string): readonly RoomNote[] =>
  text.split("\n").flatMap((line) => {
    const from = line.indexOf("{");
    const to = line.lastIndexOf("}");
    if (from === -1 || to < from) {
      return [];
    }
    try {
      const parsed: unknown = JSON.parse(line.slice(from, to + 1));
      return Option.toArray(decodeNote(parsed));
    } catch {
      return [];
    }
  });

const QueryAnswer = Schema.Struct({
  result: Schema.Struct({
    events: Schema.Struct({
      events: Schema.Array(Schema.Struct({ source: Schema.Unknown })),
    }),
  }),
});

export const liveNotes = (script: string, hours: number) =>
  Effect.gen(function* live() {
    const token = yield* Config.Redacted("CLOUDFLARE_API_TOKEN");
    const account = yield* Config.String("CLOUDFLARE_ACCOUNT_ID").pipe(
      Config.withDefault(ROOMS_ACCOUNT)
    );
    const now = yield* Clock.currentTimeMillis;
    const client = yield* HttpClient.HttpClient;
    const request = yield* HttpClientRequest.post(
      `https://api.cloudflare.com/client/v4/accounts/${account}/workers/observability/telemetry/query`
    ).pipe(
      HttpClientRequest.bearerToken(Redacted.value(token)),
      HttpClientRequest.bodyJson({
        limit: MOST_EVENTS,
        parameters: {
          filters: [
            {
              key: "$workers.scriptName",
              operation: "eq",
              type: "string",
              value: script,
            },
          ],
        },
        queryId: "rushline-rooms-read",
        timeframe: { from: now - hours * MS_PER_HOUR, to: now },
        view: "events",
      })
    );
    const response = yield* client.execute(request);
    const answer = yield* HttpClientResponse.schemaBodyJson(QueryAnswer)(
      yield* HttpClientResponse.filterStatusOk(response)
    );
    return answer.result.events.events.flatMap(({ source }) =>
      Option.toArray(decodeNote(source))
    );
  }).pipe(
    Effect.mapError(
      (cause) =>
        new RoomReadFailed({
          cause,
          message: `Could not read the Workers logs: ${String(cause)}`,
        })
    )
  );

export const main = Effect.fn("rooms.read")(function* main(
  args: readonly string[]
) {
  const { file, hours, last, race, script } = yield* options(args);
  const fileSystem = yield* FileSystem.FileSystem;
  const notes =
    file === undefined
      ? yield* liveNotes(script, Number(hours))
      : notesOfLines(yield* fileSystem.readFileString(file));
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
