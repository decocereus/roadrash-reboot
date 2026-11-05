import { describe, expect, it } from "vitest";

import { eased } from "./alignment.ts";
import { crossingReservationOf } from "./crossings.ts";
import type { CrossingRule } from "./crossings.ts";
import { roadIds } from "./road.ts";
import { roads, trackFor } from "./roads.ts";
import { compileTrack } from "./track.ts";
import type { TrackPlan } from "./track.ts";

const junction: CrossingRule = {
  id: "test-cross",
  lights: { offsetTicks: 0 },
  road: { arms: "both", carsPerMinute: 10, laneWidth: 3.4, lanesEachWay: 2 },
  s: 1500,
  walk: "zebra",
};

const flatRoad = (
  crossings: readonly CrossingRule[],
  pieces = eased([[3000, 0, 0]])
): TrackPlan => ({
  ...roads["breakwater-run"],
  bazaars: [],
  carriers: [],
  chevrons: [],
  crossings,
  crowds: [],
  districts: [{ from: 0, lanesEachWay: 2, shoulderWidth: 0.9, vergeWidth: 7 }],
  pieces,
});

const wooded = (crossings: readonly CrossingRule[]): TrackPlan => ({
  ...flatRoad(crossings),
  region: "stonepeak",
});

describe("crossings", () => {
  it("every road compiles its crossings in order along the road", () => {
    for (const roadId of roadIds) {
      const track = trackFor(roadId);
      const along = track.crossings.map(({ s }) => s);
      expect(along).toStrictEqual(along.toSorted((a, b) => a - b));
      for (const crossing of track.crossings) {
        expect(crossing.toS).toBeLessThan(track.length);
      }
    }
  });

  it("Breakwater Run has its three crossings", () => {
    expect(
      trackFor("breakwater-run").crossings.map(({ id }) => id)
    ).toStrictEqual(["harbour-cross", "market-cross", "pier-crossing"]);
  });

  it("a junction on a bend, on a crest or near the start is refused", () => {
    expect(() =>
      compileTrack(
        flatRoad(
          [junction],
          eased([
            [1300, 0, 0],
            [400, 90, 0],
            [1300, 0, 0],
          ])
        )
      )
    ).toThrow(/sits on a bend/u);
    expect(() =>
      compileTrack(
        flatRoad(
          [junction],
          eased([
            [1400, 0, 0],
            [100, 0, 6],
            [100, 0, -6],
            [1400, 0, 0],
          ])
        )
      )
    ).toThrow(/hill or a crest/u);
    expect(() => compileTrack(flatRoad([{ ...junction, s: 200 }]))).toThrow(
      /too close to the start/u
    );
  });

  it("a junction whose reserved stretch reaches a fraction of a metre into a bend is refused", () => {
    const bend = eased([
      [1300, 0, 0],
      [400, 90, 0],
      [1300, 0, 0],
    ]);
    const bare = compileTrack(flatRoad([], bend));
    const curved = bare.curvature.findIndex((each) => Math.abs(each) > 1 / 400);
    const [, end] = crossingReservationOf(junction);
    const s = bare.startS + curved - 0.4 - (end - junction.s);
    expect(() => compileTrack(flatRoad([{ ...junction, s }], bend))).toThrow(
      /sits on a bend/u
    );
    expect(
      compileTrack(flatRoad([{ ...junction, s: s - 1 }], bend)).crossings
    ).toHaveLength(1);
  });

  it("two crossings too close together are refused", () => {
    expect(() =>
      compileTrack(flatRoad([junction, { ...junction, id: "next", s: 1600 }]))
    ).toThrow(/too close to crossing/u);
  });

  it("no tree, pole or rock stands where a cross road's arm meets the road, and the far side keeps its own", () => {
    const right: CrossingRule = {
      ...junction,
      road: {
        arms: "right",
        carsPerMinute: 10,
        laneWidth: 3.4,
        lanesEachWay: 2,
      },
    };
    const bare = compileTrack(wooded([]));
    const crossed = compileTrack(wooded([right]));
    const nearArm =
      (x: number) => (prop: { readonly s: number; readonly x: number }) =>
        Math.abs(prop.s - junction.s) < 10 && Math.sign(prop.x) === x;
    expect(bare.props.filter(nearArm(1)).length).toBeGreaterThan(0);
    expect(crossed.props.filter(nearArm(1))).toStrictEqual([]);
    expect(crossed.props.filter(nearArm(-1))).toStrictEqual(
      bare.props.filter(nearArm(-1))
    );
    expect(
      crossed.props.filter((prop) => Math.abs(prop.s - 1500) > 20)
    ).toStrictEqual(bare.props.filter((prop) => Math.abs(prop.s - 1500) > 20));
  });

  it("no hazard lies in a crossing's approach on any road", () => {
    for (const roadId of roadIds) {
      const track = trackFor(roadId);
      for (const rule of track.plan.crossings) {
        const [from, to] = crossingReservationOf(rule);
        expect(
          track.hazards.filter(({ s }) => s > from && s < to)
        ).toStrictEqual([]);
      }
    }
  });
});
