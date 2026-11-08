import { parseArgs } from "node:util";

import { decodeRoomPreview } from "@racer/rooms/messages";
import { enterQueue, queueUrl } from "@racer/rooms/queue-client";
import type { QueueMessage } from "@racer/rooms/queue-messages";
import { launchRoomConfig, msOf } from "@racer/rooms/room-config";
import { roomKindOf } from "@racer/rooms/room-id";
import { MOST_SEATS } from "@racer/sim/room";
import * as Clock from "effect/Clock";
import * as Data from "effect/Data";
import * as Effect from "effect/Effect";
import * as Option from "effect/Option";
import * as Schema from "effect/Schema";

const usage = "Usage: pnpm rooms:queue --url http://127.0.0.1:<port>";
const POLL_MS = 100;
const SETTLE_MS = 500;
const MARGIN_MS = 5000;

class QueueCheckFailed extends Data.TaggedError("QueueCheckFailed")<{
  readonly message: string;
}> {}

const StatusSchema = Schema.Struct({
  build: Schema.String,
  waiting: Schema.Number,
});

const decodeStatus = Schema.decodeUnknownSync(
  Schema.fromJsonString(StatusSchema)
);

type Heard = QueueMessage | { readonly kind: "lost" };

interface Rider {
  readonly heard: Heard[];
  readonly leave: () => void;
}

const fetchText = (url: string) =>
  Effect.tryPromise(async () => {
    const answer = await globalThis.fetch(url);
    return await answer.text();
  });

const openRider = (url: string, build: string, key: string): Rider => {
  const heard: Heard[] = [];
  const leave = enterQueue(url, build, key, {
    onLost: () => {
      heard.push({ kind: "lost" });
    },
    onMessage: (message) => {
      heard.push(message);
    },
  });
  return { heard, leave };
};

const placedIn = ({ heard }: Rider): string | null => {
  const placed = heard.findLast((message) => message.kind === "placed");
  return placed?.kind === "placed" ? placed.roomId : null;
};

const waitFor = (test: () => boolean, what: string, timeoutMs: number) =>
  Effect.gen(function* waiting() {
    const from = yield* Clock.currentTimeMillis;
    while (!test()) {
      if ((yield* Clock.currentTimeMillis) - from > timeoutMs) {
        return yield* new QueueCheckFailed({ message: `Timed out: ${what}.` });
      }
      yield* Effect.sleep(POLL_MS);
    }
    return (yield* Clock.currentTimeMillis) - from;
  });

const oneRoomProblems = (group: readonly Rider[]): readonly string[] => {
  const rooms = new Set(group.map(placedIn));
  const [room] = rooms;
  if (rooms.size !== 1 || room === null || room === undefined) {
    return [`A full group landed in ${rooms.size} rooms.`];
  }
  return roomKindOf(room) === "public" ? [] : [`${room} is not a public room.`];
};

const ruleProblems = (url: string, roomId: string | null) =>
  Effect.gen(function* rule() {
    const preview = decodeRoomPreview(
      yield* fetchText(`${url}/rooms/${roomId ?? ""}`)
    );
    if (Option.isNone(preview)) {
      return ["The public room did not say its rules."];
    }
    const { bikeId, tier } = preview.value.rule;
    const { publicRace } = launchRoomConfig;
    return bikeId === publicRace.bikeId && tier === publicRace.tier
      ? []
      : [`The public room runs ${bikeId} at tier ${tier}.`];
  });

export const main = Effect.fn("rooms.queue")(function* queue(
  args: readonly string[]
) {
  const { url } = parseArgs({
    args: [...args],
    options: { url: { type: "string" } },
  }).values;
  if (url === undefined || url === "") {
    return yield* new QueueCheckFailed({ message: usage });
  }
  const { build } = decodeStatus(yield* fetchText(`${url}/queue`));
  const quitter = openRider(url, build, crypto.randomUUID());
  yield* waitFor(() => quitter.heard.length > 0, "a first answer", 5000);
  quitter.leave();
  yield* Effect.sleep(SETTLE_MS);
  const { waiting: afterLeaving } = decodeStatus(
    yield* fetchText(`${url}/queue`)
  );
  const member = crypto.randomUUID();
  const olderTab = openRider(url, build, member);
  yield* waitFor(() => olderTab.heard.length > 0, "the first tab queued", 5000);
  const newerTab = openRider(url, build, member);
  yield* waitFor(
    () => olderTab.heard.some(({ kind }) => kind === "refused"),
    "the first tab told its spot moved",
    5000
  );
  const { waiting: withTwoTabs } = decodeStatus(
    yield* fetchText(`${url}/queue`)
  );
  newerTab.leave();
  yield* Effect.sleep(SETTLE_MS);
  const group = Array.from({ length: MOST_SEATS }, () =>
    openRider(url, build, crypto.randomUUID())
  );
  yield* waitFor(
    () => group.every((rider) => placedIn(rider) !== null),
    "eight riders placed",
    5000
  );
  const lonely = openRider(url, build, crypto.randomUUID());
  const waitedMs = yield* waitFor(
    () => placedIn(lonely) !== null,
    "a lone rider placed",
    msOf(launchRoomConfig.queueWaitSeconds) + MARGIN_MS
  );
  const stale = yield* Effect.callback<Heard>((resume) => {
    enterQueue(url, `${build}-old`, crypto.randomUUID(), {
      onLost: () => {
        resume(Effect.succeed({ kind: "lost" }));
      },
      onMessage: (message) => {
        resume(Effect.succeed(message));
      },
    });
  });
  const problems = [
    ...(afterLeaving === 0 ? [] : ["A rider who left stayed in the queue."]),
    ...(withTwoTabs === 1 &&
    olderTab.heard.some(
      (message) => message.kind === "refused" && message.reason === "replaced"
    ) &&
    newerTab.heard.every(({ kind }) => kind === "waiting")
      ? []
      : ["One rider's two tabs took two tickets."]),
    ...oneRoomProblems(group),
    ...(yield* ruleProblems(url, placedIn(lonely))),
    ...(waitedMs > msOf(launchRoomConfig.queueWaitSeconds) - MARGIN_MS
      ? []
      : [`A lone rider left after only ${waitedMs} ms.`]),
    ...(stale.kind === "refused" && stale.reason === "build"
      ? []
      : ["The queue took an old build."]),
  ];
  console.log(
    JSON.stringify(
      {
        fullGroupRoom: placedIn(group[0] ?? lonely),
        loneRiderRoom: placedIn(lonely),
        loneRiderWaitedMs: waitedMs,
        problems,
        queueUrl: queueUrl(url, build, member),
      },
      null,
      2
    )
  );
  if (problems.length > 0) {
    return yield* new QueueCheckFailed({ message: problems.join(" ") });
  }
  return null;
});
