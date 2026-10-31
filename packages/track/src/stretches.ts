import type { TrackPlan } from "./track.ts";
import { madridGranVia } from "./tracks/madrid-gran-via.ts";
import { madridHook } from "./tracks/madrid-hook.ts";

export const stretchIds = ["madrid-hook", "madrid-gran-via"] as const;

export type StretchId = (typeof stretchIds)[number];

export const stretches = {
  "madrid-gran-via": madridGranVia,
  "madrid-hook": madridHook,
} as const satisfies Record<StretchId, TrackPlan>;
