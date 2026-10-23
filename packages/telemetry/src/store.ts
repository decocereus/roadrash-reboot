import * as Context from "effect/Context";
import type * as Effect from "effect/Effect";

import type { Batch } from "./schema.ts";
import type { TelemetryStoreError } from "./store-error.ts";

export type SaveResult = "saved" | "duplicate";

export class TelemetryStore extends Context.Service<
  TelemetryStore,
  {
    readonly save: (
      batch: Batch,
      line: string
    ) => Effect.Effect<SaveResult, TelemetryStoreError>;
  }
>()("@racer/telemetry/TelemetryStore") {}
