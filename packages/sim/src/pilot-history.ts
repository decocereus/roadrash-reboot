import { TICK_SECONDS } from "./state.ts";
import type { PilotHistory } from "./state.ts";

export const CORNER_SCAN_POINTS = 121;
export const FORECAST_SECONDS = 3.5;
export const FORECAST_TICKS = Math.ceil(FORECAST_SECONDS / TICK_SECONDS) + 1;

export const createPilotHistory = (): PilotHistory => ({
  braked: new Float64Array(CORNER_SCAN_POINTS),
  courseLimit: new Float64Array(FORECAST_TICKS),
  coursePush: new Float64Array(FORECAST_TICKS),
  courseTravelled: new Float64Array(FORECAST_TICKS),
});
