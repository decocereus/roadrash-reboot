import type { RaceState } from "./state.ts";

type ReadonlyData<T> = T extends object
  ? { readonly [K in keyof T]: ReadonlyData<T[K]> }
  : T;

export type RaceView = ReadonlyData<RaceState>;
export type RiderView = RaceView["riders"][number];
export type TrafficView = RaceView["cars"][number];
