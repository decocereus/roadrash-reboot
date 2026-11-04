import { describe, expect, it } from "vitest";

import { eased } from "./alignment.ts";
import {
  openLanesAt,
  roadHalfWidthAt,
  trafficReachAt,
  vergeHalfWidthAt,
} from "./districts.ts";
import type { Districts } from "./districts.ts";
import { roads } from "./roads.ts";
import { compileTrack } from "./track.ts";
import type { Track, TrackPlan } from "./track.ts";
import { ridgeRoad } from "./tracks/ridge-road.ts";

const LANE = ridgeRoad.laneWidth;
const SHOULDER = 0.9;
const VERGE = 7;
const NARROW_FROM = 2000;
const WIDE_AGAIN_FROM = 2600;
const TAPER = 60;

const straight = (
  districts: Districts,
  crossings: TrackPlan["crossings"] = []
): Track =>
  compileTrack({
    ...ridgeRoad,
    carriers: [],
    chevrons: [],
    crossings,
    districts,
    hazardsPerKilometre: 0,
    pieces: eased([[6000, 0, 0]]),
  });

const lanes = (from: number, lanesEachWay: 1 | 2 | 3) => ({
  from,
  lanesEachWay,
  shoulderWidth: SHOULDER,
  vergeWidth: VERGE,
});

const threeOneThree: Districts = [
  { ...lanes(0, 3), from: 0 },
  lanes(NARROW_FROM, 1),
  lanes(WIDE_AGAIN_FROM, 3),
];

const halfOf = (count: number): number => count * LANE + SHOULDER;

const crossingAt = (s: number) => ({
  id: `crossing-at-${s}`,
  lights: null,
  road: null,
  s,
  walk: "zebra" as const,
});

describe("a road of several districts", () => {
  const track = straight(threeOneThree);

  it("keeps the wide width up to the taper, then narrows across it inside the wide district", () => {
    const start = NARROW_FROM - TAPER;
    expect(roadHalfWidthAt(track, start - 1)).toBe(halfOf(3));
    expect(roadHalfWidthAt(track, start)).toBe(halfOf(3));
    expect(roadHalfWidthAt(track, start + TAPER / 2)).toBeCloseTo(
      (halfOf(3) + halfOf(1)) / 2,
      9
    );
    expect(roadHalfWidthAt(track, NARROW_FROM)).toBe(halfOf(1));
  });

  it("narrows the verge with the road", () => {
    expect(vergeHalfWidthAt(track, NARROW_FROM - TAPER)).toBe(
      halfOf(3) + VERGE
    );
    expect(vergeHalfWidthAt(track, NARROW_FROM)).toBe(halfOf(1) + VERGE);
  });

  it("stays narrow for the whole narrow district and widens only after it", () => {
    expect(roadHalfWidthAt(track, NARROW_FROM + 300)).toBe(halfOf(1));
    expect(roadHalfWidthAt(track, WIDE_AGAIN_FROM)).toBe(halfOf(1));
    expect(roadHalfWidthAt(track, WIDE_AGAIN_FROM + TAPER / 2)).toBeCloseTo(
      (halfOf(3) + halfOf(1)) / 2,
      9
    );
    expect(roadHalfWidthAt(track, WIDE_AGAIN_FROM + TAPER)).toBe(halfOf(3));
  });

  it("counts the narrower lanes as open through both tapers", () => {
    expect(openLanesAt(track, NARROW_FROM - TAPER - 1)).toBe(3);
    expect(openLanesAt(track, NARROW_FROM - TAPER)).toBe(1);
    expect(openLanesAt(track, NARROW_FROM - 1)).toBe(1);
  });

  it("keeps them narrow to the end of the far taper", () => {
    expect(openLanesAt(track, NARROW_FROM + 300)).toBe(1);
    expect(openLanesAt(track, WIDE_AGAIN_FROM + TAPER - 1)).toBe(1);
    expect(openLanesAt(track, WIDE_AGAIN_FROM + TAPER)).toBe(3);
  });

  it("brings traffic in before the taper and lets it out after, thirty metres to a lane", () => {
    const narrowing = NARROW_FROM - TAPER;
    expect(trafficReachAt(track, narrowing)).toBeCloseTo(0.5 * LANE, 9);
    expect(trafficReachAt(track, narrowing - 30)).toBeCloseTo(1.5 * LANE, 9);
    expect(trafficReachAt(track, narrowing - 60)).toBeCloseTo(2.5 * LANE, 9);
    expect(trafficReachAt(track, narrowing - 61)).toBeCloseTo(2.5 * LANE, 9);
  });

  it("lets traffic out after the far taper at the same rate", () => {
    const widening = WIDE_AGAIN_FROM + TAPER;
    expect(trafficReachAt(track, widening - 1)).toBeCloseTo(0.5 * LANE, 9);
    expect(trafficReachAt(track, widening + 30 - 1)).toBeCloseTo(1.5 * LANE, 9);
    expect(trafficReachAt(track, widening + 60 - 1)).toBeCloseTo(2.5 * LANE, 9);
  });

  it("lists every lane of the widest district", () => {
    expect(track.sameWayLanes).toHaveLength(3);
    expect(track.oncomingLanes).toHaveLength(3);
  });

  it("reads one number the whole way along a road of one district", () => {
    for (const plan of Object.values(roads)) {
      const uniform = compileTrack(plan);
      const [only] = plan.districts;
      const half = only.lanesEachWay * plan.laneWidth + only.shoulderWidth;
      for (let s = uniform.startS; s < uniform.endS; s += 97.3) {
        expect(roadHalfWidthAt(uniform, s)).toBe(half);
        expect(vergeHalfWidthAt(uniform, s)).toBe(half + only.vergeWidth);
        expect(openLanesAt(uniform, s)).toBe(only.lanesEachWay);
      }
    }
  });
});

describe("compiling districts refuses", () => {
  it("a narrow district shorter than one taper", () => {
    expect(() =>
      straight([
        { ...lanes(0, 3), from: 0 },
        lanes(NARROW_FROM, 1),
        lanes(NARROW_FROM + TAPER - 1, 3),
      ])
    ).toThrow(`runs ${TAPER - 1} m and its tapers need ${TAPER} m`);
  });

  it("a wide district shorter than the two tapers it holds", () => {
    expect(() =>
      straight([
        { ...lanes(0, 1), from: 0 },
        lanes(NARROW_FROM, 3),
        lanes(NARROW_FROM + 2 * TAPER - 1, 1),
      ])
    ).toThrow(`runs ${2 * TAPER - 1} m and its tapers need ${2 * TAPER} m`);
  });

  it("a crossing whose reserved stretch reaches a taper", () => {
    expect(() =>
      straight(threeOneThree, [crossingAt(NARROW_FROM - TAPER - 20)])
    ).toThrow("over the taper");
    expect(() =>
      straight(threeOneThree, [crossingAt(WIDE_AGAIN_FROM + TAPER + 20)])
    ).toThrow("over the taper");
  });

  it("no crossing clear of the tapers", () => {
    expect(() =>
      straight(threeOneThree, [
        crossingAt(NARROW_FROM - TAPER - 100),
        crossingAt(WIDE_AGAIN_FROM + TAPER + 100),
      ])
    ).not.toThrow();
  });
});
