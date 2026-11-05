import { describe, expect, it } from "vitest";

import { eased } from "./alignment.ts";
import { roadHalfWidthAt, vergeHalfWidthAt } from "./districts.ts";
import { roadIds } from "./road.ts";
import { roads, trackFor } from "./roads.ts";
import { STALL_FRONT_FROM_ROAD, stallSizes } from "./stalls.ts";
import type { StallFootprint } from "./stalls.ts";
import { compileTrack } from "./track.ts";
import type { Track, TrackPlan, TrackProp } from "./track.ts";

const breakwater = trackFor("breakwater-run");
const MARKET_FROM = 1300;
const MARKET_TO = 1740;

const rowOf = (stalls: readonly StallFootprint[], side: number) =>
  stalls.filter((stall) => Math.sign(stall.x) === side);

const startOf = ({ halfLength, s }: StallFootprint) => s - halfLength;

const endOf = ({ halfLength, s }: StallFootprint) => s + halfLength;

const frontOf = ({ halfWidth, x }: StallFootprint) => Math.abs(x) - halfWidth;

const backOf = ({ halfWidth, x }: StallFootprint) => Math.abs(x) + halfWidth;

const stands = (stall: StallFootprint, prop: TrackProp) =>
  Math.abs(prop.s - stall.s) < stall.halfLength + prop.radius &&
  Math.abs(prop.x - stall.x) < stall.halfWidth + prop.radius;

const flat = (over: Partial<TrackPlan>): TrackPlan => ({
  ...roads["breakwater-run"],
  carriers: [],
  chevrons: [],
  crossings: [],
  districts: [{ from: 0, lanesEachWay: 2, shoulderWidth: 0.9, vergeWidth: 7 }],
  pieces: eased([[3000, 0, 0]]),
  ...over,
});

const withoutStalls = (track: Track) => {
  const { stalls: _stalls, ...rest } = track;
  return rest;
};

describe("Breakwater Run's bazaar", () => {
  it("holds this list of stalls, from the road's seed", () => {
    expect(breakwater.stalls).toHaveLength(135);
    expect(rowOf(breakwater.stalls, -1)).toHaveLength(68);
    expect(rowOf(breakwater.stalls, 1)).toHaveLength(67);
    expect(breakwater.stalls.slice(0, 2)).toStrictEqual([
      {
        halfLength: 2,
        halfWidth: 1.5,
        id: "stall-0",
        s: 1302,
        variant: "fruit",
        x: -8.1,
      },
      {
        halfLength: 2.3,
        halfWidth: 1.5,
        id: "stall-1",
        s: 1302.3,
        variant: "parts",
        x: 8.1,
      },
    ]);
    expect(breakwater.stalls.at(-1)?.s).toBeCloseTo(1736.9468, 3);
  });

  it("is the same list every time the road compiles", () => {
    expect(compileTrack(roads["breakwater-run"]).stalls).toStrictEqual(
      breakwater.stalls
    );
  });

  it("fills both footpaths of the market squeeze, a stall every 6 to 7 m", () => {
    for (const side of [-1, 1]) {
      const row = rowOf(breakwater.stalls, side);
      const [first] = row;
      const last = row.at(-1);
      if (!first || !last) {
        throw new Error("A footpath of the market has no stalls.");
      }
      expect(startOf(first)).toBeGreaterThanOrEqual(MARKET_FROM);
      expect(endOf(last)).toBeLessThanOrEqual(MARKET_TO);
      const pitch = (last.s - first.s) / (row.length - 1);
      expect(pitch).toBeGreaterThan(6);
      expect(pitch).toBeLessThan(7);
    }
  });

  it("leaves a gap to the next stall on the footpath, and never repeats a kind beside itself", () => {
    for (const side of [-1, 1]) {
      const row = rowOf(breakwater.stalls, side);
      const pairs = row.slice(1).map((stall, place) => [row[place], stall]);
      const crowded = pairs.filter(
        ([before, stall]) =>
          !before ||
          !stall ||
          startOf(stall) - endOf(before) < 2 ||
          stall.variant === before.variant
      );
      expect(crowded).toStrictEqual([]);
    }
  });

  it("leaves a strip between the kerb and every stall, and stands inside the verge", () => {
    for (const stall of breakwater.stalls) {
      const road = roadHalfWidthAt(breakwater, stall.s);
      expect(frontOf(stall)).toBeCloseTo(road + STALL_FRONT_FROM_ROAD, 5);
      expect(backOf(stall)).toBeLessThanOrEqual(
        vergeHalfWidthAt(breakwater, stall.s)
      );
    }
  });

  it("sizes every stall by its kind", () => {
    for (const stall of breakwater.stalls) {
      const { deep, wide } = stallSizes[stall.variant];
      expect([stall.halfLength * 2, stall.halfWidth * 2]).toStrictEqual([
        wide,
        deep,
      ]);
    }
  });

  it("clears the road's chevrons and lamp poles, which stay where the road put them", () => {
    const standing = breakwater.props.filter(
      ({ kind }) => kind === "chevron" || kind === "pole"
    );
    expect(standing.length).toBeGreaterThan(0);
    for (const stall of breakwater.stalls) {
      expect(standing.filter((prop) => stands(stall, prop))).toStrictEqual([]);
    }
    const bare = compileTrack({ ...roads["breakwater-run"], bazaars: [] });
    expect(
      bare.props.filter(({ kind }) => kind === "chevron" || kind === "pole")
    ).toStrictEqual(standing);
  });

  it("takes out the trees and rocks it stands on, and nothing else about the road moves", () => {
    const bare = compileTrack({ ...roads["breakwater-run"], bazaars: [] });
    const gone = bare.props.filter(
      (prop) =>
        !breakwater.props.some(({ s, x }) => s === prop.s && x === prop.x)
    );
    expect(gone.length).toBeGreaterThan(0);
    expect(
      gone.every(({ kind }) => kind === "tree" || kind === "rock")
    ).toBeTruthy();
    for (const stall of breakwater.stalls) {
      expect(
        breakwater.solidProps.filter((prop) => stands(stall, prop))
      ).toStrictEqual([]);
    }
    const {
      props: _bareProps,
      solidProps: _bareSolid,
      ...bareRoad
    } = withoutStalls(bare);
    const {
      props: _props,
      solidProps: _solid,
      ...builtRoad
    } = withoutStalls(breakwater);
    expect({ ...builtRoad, plan: null }).toStrictEqual({
      ...bareRoad,
      plan: null,
    });
  });
});

describe("placing stalls", () => {
  it("draws none on a road with no bazaar", () => {
    for (const id of roadIds.filter((road) => road !== "breakwater-run")) {
      expect(trackFor(id).stalls).toStrictEqual([]);
    }
  });

  it("stands no stall in a crossing's box", () => {
    const { crossings, stalls } = compileTrack(
      flat({
        bazaars: [{ from: 1300, to: 1700 }],
        crossings: [
          {
            id: "test-cross",
            lights: { offsetTicks: 0 },
            road: {
              arms: "both",
              carsPerMinute: 10,
              laneWidth: 3.4,
              lanesEachWay: 2,
            },
            s: 1500,
            walk: "zebra",
          },
        ],
      })
    );
    const [crossing] = crossings;
    if (!crossing) {
      throw new Error("The test road lost its crossing.");
    }
    expect(stalls.length).toBeGreaterThan(0);
    expect(stalls.some((stall) => stall.s < crossing.fromS)).toBeTruthy();
    expect(stalls.some((stall) => stall.s > crossing.toS)).toBeTruthy();
    for (const stall of stalls) {
      expect(
        endOf(stall) <= crossing.fromS || startOf(stall) >= crossing.toS
      ).toBeTruthy();
    }
  });

  it("uses the district's footpath, and places nothing where the verge cannot hold a stall", () => {
    const narrow = flat({
      bazaars: [{ from: 1300, to: 1700 }],
      districts: [
        { from: 0, lanesEachWay: 2, shoulderWidth: 0.9, vergeWidth: 3 },
      ],
    });
    expect(compileTrack(narrow).stalls).toStrictEqual([]);
  });

  it("refuses a bazaar that is not a stretch of the road", () => {
    for (const bazaar of [
      { from: -5, to: 100 },
      { from: 100, to: 90_000 },
      { from: 300, to: 300 },
    ]) {
      expect(() => compileTrack(flat({ bazaars: [bazaar] }))).toThrow(
        /which is not a stretch/u
      );
    }
  });
});
