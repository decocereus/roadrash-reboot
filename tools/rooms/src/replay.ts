import { parseArgs } from "node:util";

import { seatedRace } from "@racer/career/room-race";
import {
  tapeEndName,
  TapeEndSchema,
  TapeHeaderSchema,
  tapeHeaderName,
  tapePartName,
} from "@racer/rooms/tape";
import type { TapeHeader } from "@racer/rooms/tape";
import { replayTape } from "@racer/sim/room-tape";
import type { TapeReplay } from "@racer/sim/room-tape";
import { riderOf, TICK_SECONDS } from "@racer/sim/state";
import type { RaceState, RiderId } from "@racer/sim/state";
import * as Console from "effect/Console";
import * as Data from "effect/Data";
import * as Effect from "effect/Effect";
import * as FileSystem from "effect/FileSystem";
import * as Schema from "effect/Schema";

const USAGE = "Usage: pnpm rooms:replay --dir <folder holding one race's tape>";

class TapeReplayFailed extends Data.TaggedError("TapeReplayFailed")<{
  readonly cause?: unknown;
  readonly message: string;
}> {}

const decodeHeader = Schema.decodeUnknownEffect(
  Schema.fromJsonString(TapeHeaderSchema)
);
const decodeEnd = Schema.decodeUnknownEffect(
  Schema.fromJsonString(TapeEndSchema)
);

const failed = (message: string, cause?: unknown) =>
  new TapeReplayFailed({ cause, message });

const riderLines = (
  state: RaceState,
  humans: readonly RiderId[]
): readonly string[] =>
  humans.flatMap((id) => {
    const rider = riderOf(state.riders, id);
    return rider
      ? [
          `  Rider ${id}: ${rider.mode}, finish tick ${rider.finishTick}, road ${Math.round(rider.s)} m, ${rider.crashes} crashes`,
        ]
      : [];
  });

const replayReport = (
  header: TapeHeader,
  humans: readonly RiderId[],
  replay: TapeReplay
): string => {
  const title = `Race ${header.raceId} on ${header.road}, build ${header.build}, ${header.seats} seat(s)`;
  switch (replay.kind) {
    case "wrongSetup": {
      return `${title}\n  Refused: this code builds setup ${replay.digest}, and the tape was recorded on ${header.digest}. Replay it at build ${header.build}.`;
    }
    case "unreadable": {
      return `${title}\n  The tape cannot be read after tick ${replay.afterTick}.`;
    }
    case "gap": {
      return `${title}\n  The tape jumps from tick ${replay.afterTick} to tick ${replay.tick}.`;
    }
    case "diverged": {
      return `${title}\n  The replay left the race's state at tick ${replay.tick}.`;
    }
    case "wrongEnd": {
      return `${title}\n  The tape reaches tick ${replay.afterTick}, and the race ended at tick ${replay.endTick}.`;
    }
    case "matched": {
      const { tick } = replay.state;
      return [
        title,
        `  Replayed all ${tick} ticks (${(tick * TICK_SECONDS).toFixed(1)} s). All ${replay.hashes} state hashes match, the last one at the race's end.`,
        ...riderLines(replay.state, humans),
      ].join("\n");
    }
    default: {
      return replay satisfies never;
    }
  }
};

export const main = Effect.fn("rooms.replay")(function* main(
  args: readonly string[]
) {
  const { dir } = parseArgs({
    args: [...args],
    options: { dir: { type: "string" } },
  }).values;
  if (dir === undefined) {
    return yield* failed(USAGE);
  }
  const files = yield* FileSystem.FileSystem;
  const header = yield* files.readFileString(`${dir}/${tapeHeaderName}`).pipe(
    Effect.flatMap(decodeHeader),
    Effect.mapError((cause) =>
      failed(`No readable ${tapeHeaderName} in ${dir}.`, cause)
    )
  );
  const end = yield* files.readFileString(`${dir}/${tapeEndName}`).pipe(
    Effect.flatMap(decodeEnd),
    Effect.mapError((cause) =>
      failed(
        `No readable ${tapeEndName} in ${dir}: the race never ended cleanly.`,
        cause
      )
    )
  );
  const parts: Uint8Array[] = [];
  for (let part = 0; part < end.parts; part += 1) {
    const name = tapePartName(part);
    parts.push(
      yield* files
        .readFile(`${dir}/${name}`)
        .pipe(
          Effect.mapError((cause) =>
            failed(`Part ${name} is missing from ${dir}.`, cause)
          )
        )
    );
  }
  const { humans, setup } = seatedRace(header.seed, header.seats, header.rule);
  const replay = replayTape(setup, header.digest, parts, end);
  yield* Console.log(replayReport(header, humans, replay));
  if (replay.kind !== "matched") {
    return yield* failed("The replay did not match the race.");
  }
  return replay;
});
