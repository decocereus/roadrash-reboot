import { describe, expect, it } from "vitest";

import { eased } from "./alignment.ts";
import { crossingReservationOf } from "./crossings.ts";
import type { CrossingRule } from "./crossings.ts";
import { roadIds, roadLevels } from "./road.ts";
import { roads, trackFor } from "./roads.ts";
import { compileTrack } from "./track.ts";
import type { TrackPlan } from "./track.ts";

const junction: CrossingRule = {
  fromLevel: 1,
  id: "test-cross",
  lights: { offsetTicks: 0 },
  road: { arms: "both", laneWidth: 3.4, lanesEachWay: 2 },
  s: 1500,
  walk: "zebra",
};

const flatRoad = (
  crossings: readonly CrossingRule[],
  pieces = eased([[3000, 0, 0]])
): TrackPlan => ({
  ...roads["breakwater-run"].plan,
  chevrons: [],
  crossings,
  features: [],
  pieces,
});

const wooded = (crossings: readonly CrossingRule[]): TrackPlan => ({
  ...flatRoad(crossings),
  region: "kettle-woods",
});

describe("crossings", () => {
  it("every road compiles its crossings at every level, in order along the road", () => {
    for (const roadId of roadIds) {
      for (const level of roadLevels) {
        const track = trackFor(roadId, level);
        const along = track.crossings.map(({ s }) => s);
        expect(along).toStrictEqual(along.toSorted((a, b) => a - b));
        for (const crossing of track.crossings) {
          expect(crossing.toS).toBeLessThan(track.length);
        }
      }
    }
  });

  it("Breakwater Run has its three crossings from level 1 and the esplanade junction from level 4", () => {
    const ids = roadLevels.map((level) =>
      trackFor("breakwater-run", level).crossings.map(({ id }) => id)
    );
    const first = ["harbour-cross", "market-cross", "pier-crossing"];
    expect(ids).toStrictEqual([
      first,
      first,
      first,
      [...first, "esplanade-cross"],
      [...first, "esplanade-cross"],
    ]);
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

  it("two crossings too close together, or one in a ramp's landing, are refused", () => {
    expect(() =>
      compileTrack(flatRoad([junction, { ...junction, id: "next", s: 1600 }]))
    ).toThrow(/too close to crossing/u);
    expect(() =>
      compileTrack({
        ...flatRoad([junction]),
        features: [
          {
            feature: { kind: "jump", length: 16, rise: 0.8, width: 1.4 },
            fromLevel: 1,
            id: "ramp",
            placement: "fixed",
            s: 1420,
            x: 3.6,
          },
        ],
      })
    ).toThrow(/approach or landing of a ramp/u);
  });

  it("no tree, pole or rock stands where a cross road's arm meets the road, and the far side keeps its own", () => {
    const right: CrossingRule = {
      ...junction,
      road: { arms: "right", laneWidth: 3.4, lanesEachWay: 2 },
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

  it("no hazard lies in a crossing's approach on any level of any road", () => {
    for (const roadId of roadIds) {
      for (const level of roadLevels) {
        const track = trackFor(roadId, level);
        for (const rule of track.plan.crossings) {
          const [from, to] = crossingReservationOf(rule);
          expect(
            track.hazards.filter(({ s }) => s > from && s < to)
          ).toStrictEqual([]);
        }
      }
    }
  });
});
