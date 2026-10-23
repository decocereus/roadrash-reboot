import { raceOwned, TICK_SECONDS } from "./state.ts";

export const CORNER_SCAN_POINTS = 121;
export const FORECAST_SECONDS = 3.5;
export const FORECAST_TICKS = Math.ceil(FORECAST_SECONDS / TICK_SECONDS) + 1;

export interface PilotHistory {
  readonly braked: Float64Array;
  readonly courseTravelled: Float64Array;
  readonly coursePush: Float64Array;
  readonly courseLimit: Float64Array;
}

export const pilotHistoryOf = raceOwned((): PilotHistory => ({
  braked: new Float64Array(CORNER_SCAN_POINTS),
  courseLimit: new Float64Array(FORECAST_TICKS),
  coursePush: new Float64Array(FORECAST_TICKS),
  courseTravelled: new Float64Array(FORECAST_TICKS),
}));
