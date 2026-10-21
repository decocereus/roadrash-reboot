import { appendFile, mkdir, readFile } from "node:fs/promises";
import path from "node:path";

import * as Schema from "effect/Schema";

import type {
  SaveResult,
  TelemetryStore,
} from "../../packages/telemetry/src/store.ts";

const storedLine = Schema.Struct({
  batch: Schema.Struct({ batchId: Schema.Number }),
});

const decodeStored = Schema.decodeUnknownOption(
  Schema.fromJsonString(storedLine)
);

export const sessionFile = (directory: string, sessionId: string): string =>
  path.join(directory, `${sessionId}.jsonl`);

const storedIds = async (file: string): Promise<Set<number>> => {
  const ids = new Set<number>();
  const text = await readFile(file, "utf-8").catch(() => "");
  for (const line of text.split("\n")) {
    const stored = decodeStored(line);
    if (stored._tag === "Some") {
      ids.add(stored.value.batch.batchId);
    }
  }
  return ids;
};

export const createJsonlStore = (directory: string): TelemetryStore => {
  const known = new Map<string, Set<number>>();
  let writing: Promise<null> = Promise.resolve(null);

  const save = async (
    sessionId: string,
    batchId: number,
    line: string
  ): Promise<SaveResult> => {
    const file = sessionFile(directory, sessionId);
    const ids = known.get(sessionId) ?? (await storedIds(file));
    known.set(sessionId, ids);
    if (ids.has(batchId)) {
      return "duplicate";
    }
    await mkdir(directory, { recursive: true });
    await appendFile(file, `${line}\n`, "utf-8");
    ids.add(batchId);
    return "saved";
  };

  return {
    async save(batch, line) {
      const previous = writing;
      const turn = Promise.withResolvers<null>();
      writing = turn.promise;
      await previous;
      try {
        return await save(batch.session.sessionId, batch.batchId, line);
      } finally {
        turn.resolve(null);
      }
    },
  };
};
