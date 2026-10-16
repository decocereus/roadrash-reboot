import type { Batch } from "./schema.ts";

export type SaveResult = "saved" | "duplicate";

export interface TelemetryStore {
  readonly save: (batch: Batch, line: string) => Promise<SaveResult>;
}

declare global {
  var __rushlineTelemetryStore: TelemetryStore | undefined;
}

export const provideTelemetryStore = (store: TelemetryStore): void => {
  globalThis.__rushlineTelemetryStore ??= store;
};

export const telemetryStore = (): TelemetryStore | null =>
  globalThis.__rushlineTelemetryStore ?? null;
