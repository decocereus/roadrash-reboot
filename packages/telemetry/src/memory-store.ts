import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";

import type { Batch } from "./schema.ts";
import { TelemetryStore } from "./store.ts";
import type { SaveResult } from "./store.ts";

export const memoryStore = () => {
  const lines: string[] = [];
  const saved = new Set<string>();

  const record = (batch: Batch, line: string): SaveResult => {
    const key = `${batch.session.sessionId}/${batch.batchId}`;
    if (saved.has(key)) {
      return "duplicate";
    }
    saved.add(key);
    lines.push(line);
    return "saved";
  };

  const save = Effect.fn("telemetry.memory.save")(function* save(
    batch: Batch,
    line: string
  ) {
    return yield* Effect.sync(() => record(batch, line));
  });

  return {
    layer: Layer.succeed(TelemetryStore)(TelemetryStore.of({ save })),
    lines: (): readonly string[] => [...lines],
  };
};
