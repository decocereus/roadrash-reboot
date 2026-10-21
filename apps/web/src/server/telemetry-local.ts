import type { TelemetryStore } from "@racer/telemetry/store";
import type * as Layer from "effect/Layer";
import * as Option from "effect/Option";

declare global {
  var __rushlineTelemetryLayer: Layer.Layer<TelemetryStore> | undefined;
}

export const installLocalTelemetry = (
  layer: Layer.Layer<TelemetryStore>
): void => {
  globalThis.__rushlineTelemetryLayer ??= layer;
};

export const localTelemetry = (): Option.Option<Layer.Layer<TelemetryStore>> =>
  Option.fromNullishOr(globalThis.__rushlineTelemetryLayer);
