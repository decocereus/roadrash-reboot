import { sampleAlong } from "./alignment.ts";
import type { Centreline } from "./alignment.ts";

const laneCounts = [1, 2, 3] as const;

export type LaneCount = (typeof laneCounts)[number];

export interface District {
  readonly from: number;
  readonly lanesEachWay: LaneCount;
  readonly shoulderWidth: number;
  readonly vergeWidth: number;
}

export type Districts = readonly [
  District & { readonly from: 0 },
  ...District[],
];

export type LaneCentres =
  | readonly [number]
  | readonly [number, number]
  | readonly [number, number, number];

export interface RoadWidths {
  readonly roadHalfWidth: Float64Array;
  readonly vergeHalfWidth: Float64Array;
  readonly openLanes: Float64Array;
  readonly trafficReach: Float64Array;
}

type WidthsAlong = RoadWidths & Centreline;

interface Taper {
  readonly owner: number;
  readonly from: number;
  readonly to: number;
  readonly startRoad: number;
  readonly endRoad: number;
  readonly startVerge: number;
  readonly endVerge: number;
  readonly lanes: LaneCount;
}

interface LaidRoad {
  readonly districts: Districts;
  readonly laneWidth: number;
  readonly name: string;
}

const TAPER_LENGTH = 60;
const MERGE_METRES_PER_LANE = 30;

export const roadHalfOf = (district: District, laneWidth: number): number =>
  district.lanesEachWay * laneWidth + district.shoulderWidth;

const vergeHalfOf = (district: District, laneWidth: number): number =>
  roadHalfOf(district, laneWidth) + district.vergeWidth;

const fewerLanes = (left: LaneCount, right: LaneCount): LaneCount =>
  left < right ? left : right;

export const widestLanes = (districts: Districts): LaneCount => {
  let widest: LaneCount = districts[0].lanesEachWay;
  for (const { lanesEachWay } of districts) {
    widest = lanesEachWay > widest ? lanesEachWay : widest;
  }
  return widest;
};

export const tapersOf = ({ districts, laneWidth }: LaidRoad): Taper[] => {
  const tapers: Taper[] = [];
  for (let index = 1; index < districts.length; index += 1) {
    const before = districts[index - 1];
    const after = districts[index];
    if (before && after) {
      const startRoad = roadHalfOf(before, laneWidth);
      const endRoad = roadHalfOf(after, laneWidth);
      const startVerge = vergeHalfOf(before, laneWidth);
      const endVerge = vergeHalfOf(after, laneWidth);
      if (startRoad !== endRoad || startVerge !== endVerge) {
        const inBefore =
          startRoad === endRoad ? startVerge > endVerge : startRoad > endRoad;
        const from = inBefore ? after.from - TAPER_LENGTH : after.from;
        tapers.push({
          endRoad,
          endVerge,
          from,
          lanes: fewerLanes(before.lanesEachWay, after.lanesEachWay),
          owner: inBefore ? index - 1 : index,
          startRoad,
          startVerge,
          to: from + TAPER_LENGTH,
        });
      }
    }
  }
  return tapers;
};

export const checkDistricts = (
  { districts, name }: LaidRoad,
  tapers: readonly Taper[],
  length: number
): void => {
  if (districts.length === 1) {
    return;
  }
  for (const [index, district] of districts.entries()) {
    if (district.from % 1 !== 0) {
      throw new Error(
        `District ${index} of ${name} starts at ${district.from}, which is not a whole metre.`
      );
    }
    const tapersInside = tapers.filter(({ owner }) => owner === index).length;
    const least = Math.max(1, tapersInside) * TAPER_LENGTH;
    const reach = (districts[index + 1]?.from ?? length) - district.from;
    if (reach < least) {
      throw new Error(
        `District ${index} of ${name} runs ${reach} m and its tapers need ${least} m.`
      );
    }
  }
};

export const checkCrossingsOffTapers = (
  { name }: LaidRoad,
  crossings: readonly {
    readonly id: string;
    readonly fromS: number;
    readonly toS: number;
  }[],
  tapers: readonly Taper[]
): void => {
  for (const { fromS, id, toS } of crossings) {
    const taper = tapers.find(({ from, to }) => fromS < to && toS > from);
    if (taper) {
      throw new Error(
        `Crossing "${id}" on ${name} reserves ${fromS} to ${toS}, over the taper from ${taper.from} to ${taper.to}.`
      );
    }
  }
};

const trafficReachOf = (
  openLanes: Float64Array,
  laneWidth: number
): Float64Array => {
  const step = laneWidth / MERGE_METRES_PER_LANE;
  const reach = Float64Array.from(
    openLanes,
    (lanes) => (lanes - 0.5) * laneWidth
  );
  for (let index = 1; index < reach.length; index += 1) {
    reach[index] = Math.min(reach[index] ?? 0, (reach[index - 1] ?? 0) + step);
  }
  for (let index = reach.length - 2; index >= 0; index -= 1) {
    reach[index] = Math.min(reach[index] ?? 0, (reach[index + 1] ?? 0) + step);
  }
  return reach;
};

export const roadWidthsOf = (
  { districts, laneWidth }: LaidRoad,
  tapers: readonly Taper[],
  { sampleCount, startS }: Pick<Centreline, "sampleCount" | "startS">
): RoadWidths => {
  const roadHalfWidth = new Float64Array(sampleCount);
  const vergeHalfWidth = new Float64Array(sampleCount);
  const openLanes = new Float64Array(sampleCount);
  let current = 0;
  for (let index = 0; index < sampleCount; index += 1) {
    const s = startS + index;
    while ((districts[current + 1]?.from ?? Number.POSITIVE_INFINITY) <= s) {
      current += 1;
    }
    const district = districts[current] ?? districts[0];
    roadHalfWidth[index] = roadHalfOf(district, laneWidth);
    vergeHalfWidth[index] = vergeHalfOf(district, laneWidth);
    openLanes[index] = district.lanesEachWay;
  }
  for (const taper of tapers) {
    for (let index = 0; index < sampleCount; index += 1) {
      const s = startS + index;
      if (s >= taper.from && s <= taper.to) {
        const share = (s - taper.from) / TAPER_LENGTH;
        roadHalfWidth[index] =
          taper.startRoad + (taper.endRoad - taper.startRoad) * share;
        vergeHalfWidth[index] =
          taper.startVerge + (taper.endVerge - taper.startVerge) * share;
        if (s < taper.to) {
          openLanes[index] = taper.lanes;
        }
      }
    }
  }
  return {
    openLanes,
    roadHalfWidth,
    trafficReach: trafficReachOf(openLanes, laneWidth),
    vergeHalfWidth,
  };
};

const sampleAt = sampleAlong;

export const roadHalfWidthAt = (track: WidthsAlong, s: number): number =>
  sampleAt(track, track.roadHalfWidth, s);

export const vergeHalfWidthAt = (track: WidthsAlong, s: number): number =>
  sampleAt(track, track.vergeHalfWidth, s);

const sampleIndexOf = (track: WidthsAlong, s: number): number =>
  Math.floor(Math.min(track.sampleCount - 1, Math.max(0, s - track.startS)));

export const openLanesAt = (track: WidthsAlong, s: number): number =>
  track.openLanes[sampleIndexOf(track, s)] ?? 1;

export const widestVergeAlong = (
  track: WidthsAlong,
  from: number,
  to: number
): number => {
  let widest = 0;
  const last = Math.min(track.sampleCount - 1, sampleIndexOf(track, to) + 1);
  for (let index = sampleIndexOf(track, from); index <= last; index += 1) {
    widest = Math.max(widest, track.vergeHalfWidth[index] ?? 0);
  }
  return widest;
};
