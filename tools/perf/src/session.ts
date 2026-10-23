import path from "node:path";
import { parseArgs } from "node:util";

import { batchSchema } from "@racer/telemetry/schema";
import type { Batch } from "@racer/telemetry/schema";
import * as Effect from "effect/Effect";
import * as FileSystem from "effect/FileSystem";
import * as Option from "effect/Option";
import * as Schema from "effect/Schema";

import { printSummary } from "./session-report.ts";
import { summarise } from "./session-summary.ts";
import type { Loaded, SessionSummary } from "./session-summary.ts";

const storedLine = Schema.fromJsonString(
  Schema.Struct({ batch: batchSchema, receivedAt: Schema.String })
);

const decodeLine = Schema.decodeUnknownOption(storedLine);

const loadSession = Effect.fnUntraced(function* loadSession(file: string) {
  const fs = yield* FileSystem.FileSystem;
  const text = yield* fs.readFileString(file, "utf-8");
  const byId = new Map<number, Batch>();
  const received: string[] = [];
  let duplicateLines = 0;
  let unreadableLines = 0;
  for (const line of text.split("\n")) {
    if (line.trim() === "") {
      continue;
    }
    const decoded = decodeLine(line);
    if (Option.isNone(decoded)) {
      unreadableLines += 1;
      continue;
    }
    const { batch, receivedAt } = decoded.value;
    if (byId.has(batch.batchId)) {
      duplicateLines += 1;
      continue;
    }
    byId.set(batch.batchId, batch);
    received.push(receivedAt);
  }
  const loaded: Loaded = {
    batches: [...byId.values()].toSorted(
      (left, right) => left.batchId - right.batchId
    ),
    duplicateLines,
    id: path.basename(file, ".jsonl"),
    received: received.toSorted(),
    unreadableLines,
  };
  return loaded;
});

export const readOptions = () =>
  parseArgs({
    options: {
      device: { type: "string" },
      dir: { default: "tools/perf/results/sessions", type: "string" },
      json: { default: false, type: "boolean" },
      session: { type: "string" },
      worst: { default: "10", type: "string" },
    },
  }).values;

type SessionOptions = ReturnType<typeof readOptions>;

export const main = Effect.fn("session.main")(function* main(
  options: SessionOptions
) {
  const fs = yield* FileSystem.FileSystem;
  const names = yield* fs
    .readDirectory(options.dir)
    .pipe(Effect.orElseSucceed((): string[] => []));
  const files = names
    .filter((name) => name.endsWith(".jsonl"))
    .map((name) => path.join(options.dir, name));
  const loaded = yield* Effect.all(
    files.map((file) => loadSession(file)),
    { concurrency: "unbounded" }
  );
  const worstLimit = Number(options.worst);
  const summaries = loaded
    .filter(
      (each) =>
        options.session === undefined ||
        options.session === "" ||
        each.id.startsWith(options.session)
    )
    .map((each) => ({
      parts: each.batches.at(-1)?.parts ?? [],
      summary: summarise(each, worstLimit),
    }))
    .filter(
      (each): each is { parts: string[]; summary: SessionSummary } =>
        each.summary !== null &&
        (options.device === undefined ||
          options.device === "" ||
          each.summary.devices.includes(options.device))
    )
    .toSorted((left, right) =>
      left.summary.lastReceived.localeCompare(right.summary.lastReceived)
    );

  yield* Effect.sync(() => {
    if (options.json) {
      console.log(
        JSON.stringify(
          summaries.map((each) => each.summary),
          null,
          2
        )
      );
    } else if (summaries.length === 0) {
      console.log(`No sessions in ${options.dir}.`);
    } else {
      console.log(`${summaries.length} session(s) in ${options.dir}`);
      for (const { summary } of summaries) {
        console.log(
          `  ${summary.session.sessionId}  ${summary.devices.join(",").padEnd(11)}  ${summary.session.build.sha}${summary.session.build.dirty ? "+" : " "}  ${summary.lastReceived}  batches ${summary.batches.received}  frames ${summary.frames}  markers ${summary.markers.length}  suspects ${summary.suspects.length}`
        );
      }
      const latest = summaries.at(-1);
      if (latest) {
        console.log("");
        printSummary(latest.summary, latest.parts);
      }
    }
  });
});
