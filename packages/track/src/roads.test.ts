import { describe, expect, it } from "vitest";

import { openLanesAt, roadHalfWidthAt } from "./districts.ts";
import {
  HAZARD_FINISH_CLEARANCE,
  HAZARD_GENTLE_CURVATURE,
  HAZARD_START_CLEARANCE,
  HAZARD_TIGHT_CURVATURE,
  hazardKinds,
  hazardSizes,
  inSight,
  ONLY_LANE_OIL_CURVATURE,
} from "./hazards.ts";
import type { HazardKind } from "./hazards.ts";
import { nextSeed } from "./random.ts";
import type { HazardSetting } from "./regions.ts";
import { roadIds } from "./road.ts";
import type { RoadId } from "./road.ts";
import { regionOf, roads, trackFor } from "./roads.ts";
import { compileTrack, curvatureAt } from "./track.ts";
import type { Track, TrackProp, TrackPropKind } from "./track.ts";

const GRAVITY = 9.81;
const FIRST_TIER_SHARE = 0.6;
const PINNED_RIDGE_LENGTH = 4250;

interface Stretch {
  readonly from: number;
  readonly to: number;
}

interface Expected {
  readonly roadId: RoadId;
  readonly length: number;
  readonly traffic: number;
  readonly lowestLaunch: number;
  readonly carriers: readonly number[];
  readonly signature: Stretch | undefined;
  readonly firstTierHazards: readonly [least: number, most: number];
  readonly turnInKinds: readonly HazardKind[];
}

const design: readonly Expected[] = [
  {
    carriers: [3900, 4650],
    firstTierHazards: [12, 18],
    length: 8500,
    lowestLaunch: 169,
    roadId: "breakwater-run",
    signature: undefined,
    traffic: 7,
    turnInKinds: ["oil", "pothole"],
  },
  {
    carriers: [2600, 4100],
    firstTierHazards: [4, 7],
    length: 8500,
    lowestLaunch: 152,
    roadId: "slag-row",
    signature: { from: 960, to: 1020 },
    traffic: 8,
    turnInKinds: ["oil"],
  },
  {
    carriers: [4500],
    firstTierHazards: [4, 7],
    length: 8550,
    lowestLaunch: 162,
    roadId: "ridge-road",
    signature: undefined,
    traffic: 5,
    turnInKinds: ["oil"],
  },
];

const lowestLaunchKmh = (track: Track, skipped?: Stretch): number => {
  let sharpest = 0;
  for (const [index, rate] of track.slopeRate.entries()) {
    const s = track.startS + index;
    const inSkipped =
      skipped !== undefined && s >= skipped.from && s <= skipped.to;
    if (!inSkipped) {
      sharpest = Math.min(sharpest, rate);
    }
  }
  return Math.sqrt(GRAVITY / -sharpest) * 3.6;
};

const WORD = 2 ** 32;

const digestOf = (values: Iterable<number>, scale: number): string => {
  let digest = 0;
  for (const value of values) {
    const scaled = Math.round(value * scale);
    digest = nextSeed(digest + (scaled % WORD));
    digest = nextSeed(digest + Math.floor(scaled / WORD));
  }
  return (digest + WORD).toString(16).slice(-8);
};

const propKinds: readonly TrackPropKind[] = [
  "tree",
  "pole",
  "chevron",
  "rock",
  "gate",
];

const propNumbers = (prop: TrackProp): number[] => [
  propKinds.indexOf(prop.kind),
  prop.s,
  prop.x,
  prop.radius,
  prop.scale,
];

const sharpestNear = (track: Track, s: number): number =>
  Math.max(
    ...Array.from({ length: 11 }, (_, step) =>
      Math.abs(curvatureAt(track, s - 10 + step * 5))
    )
  );

const rocksOf = (track: Track): TrackProp[] =>
  track.props.filter((prop) => prop.kind === "rock");

const treesOf = (track: Track): TrackProp[] =>
  track.props.filter((prop) => prop.kind === "tree" && prop.s > 0);

describe("the roads", () => {
  it("the registry lists the roads in career order with their regions", () => {
    expect(roadIds.map((roadId) => [roadId, regionOf(roadId)])).toStrictEqual([
      ["breakwater-run", "salt-coast"],
      ["slag-row", "lowtown"],
      ["ridge-road", "stonepeak"],
    ]);
  });

  it.each(design)(
    "$roadId is its designed length with its traffic and its own name",
    ({ length, roadId, traffic }) => {
      const track = trackFor(roadId);
      expect(Math.abs(track.length - length)).toBeLessThan(10);
      expect(track.plan.id).toBe(roadId);
      expect(track.plan.trafficPerKilometre).toBe(traffic);
      expect(track.plan.region).toBe(regionOf(roadId));
    }
  );

  it("Breakwater Run changes width district by district, with its lanes opening and closing from the outside", () => {
    const track = trackFor("breakwater-run");
    expect(
      [650, 1500, 2100, 2900, 3700, 4100, 5500, 7300].map((s) => [
        openLanesAt(track, s),
        2 * roadHalfWidthAt(track, s),
      ])
    ).toStrictEqual([
      [3, 23],
      [1, 8],
      [3, 36],
      [3, 23],
      [2, 16],
      [1, 8],
      [2, 15],
      [3, 22],
    ]);
    expect(track.sameWayLanes).toHaveLength(3);
    expect(track).toHaveLength(8500);
  });

  it("the first 4,250 m of Ridge Road are still the pinned road, sample for sample and prop for prop", () => {
    const ridge = trackFor("ridge-road");
    const samples = PINNED_RIDGE_LENGTH - ridge.startS;
    const props = ridge.props.filter((prop) => prop.s < PINNED_RIDGE_LENGTH);
    expect({
      curvature: digestOf(ridge.curvature.slice(0, samples), 1e9),
      height: digestOf(ridge.worldY.slice(0, samples), 1e6),
      line: digestOf(
        [...ridge.worldX.slice(0, samples), ...ridge.worldZ.slice(0, samples)],
        1e6
      ),
      props: digestOf(props.flatMap(propNumbers), 1e6),
      rocks: digestOf(
        props.filter((prop) => prop.kind === "rock").flatMap(propNumbers),
        1e6
      ),
      slopeRate: digestOf(ridge.slopeRate.slice(0, samples), 1e9),
    }).toStrictEqual({
      curvature: "becd6387",
      height: "bdd0d924",
      line: "cbabb60b",
      props: "5e4f225d",
      rocks: "0356dee5",
      slopeRate: "1656c28f",
    });
  });

  it("the rocks on a road stay where they are when a longer lead-in scatters its trees differently", () => {
    const plan = roads["ridge-road"];
    const pinned = compileTrack(plan);
    const longer = compileTrack({ ...plan, leadInLength: 200 });
    expect(rocksOf(longer)).toStrictEqual(rocksOf(pinned));
    expect(
      rocksOf(pinned).filter((rock) => rock.s < PINNED_RIDGE_LENGTH)
    ).toHaveLength(35);
    expect(treesOf(longer)).not.toStrictEqual(treesOf(pinned));
  });
});

describe("crests", () => {
  it.each(design)(
    "the lowest launch speed on $roadId matches the design",
    ({ lowestLaunch, roadId }) => {
      expect(
        Math.abs(lowestLaunchKmh(trackFor(roadId)) - lowestLaunch)
      ).toBeLessThan(3);
    }
  );

  it.each(design)(
    "nothing on $roadId but its signature crest launches below 160 km/h",
    ({ roadId, signature }) => {
      expect(lowestLaunchKmh(trackFor(roadId), signature)).toBeGreaterThan(160);
    }
  );
});

describe("car carriers", () => {
  it.each(design)(
    "$roadId starts its trucks where its plan says",
    ({ carriers, roadId }) => {
      expect(trackFor(roadId).carrierStarts).toStrictEqual(carriers);
    }
  );

  it("a road with no traffic has no trucks", () => {
    expect(
      compileTrack({
        ...roads["breakwater-run"],
        trafficPerKilometre: 0,
      }).carrierStarts
    ).toStrictEqual([]);
  });

  it("a truck that starts inside the start clearance or past the finish is refused", () => {
    const plan = roads["breakwater-run"];
    for (const s of [100, 90_000]) {
      expect(() => compileTrack({ ...plan, carriers: [s] })).toThrow(
        /starts off the road/u
      );
    }
  });
});

describe("hazards", () => {
  it.each(design)(
    "$roadId has its count of first-tier hazards, at least one an oil slick",
    ({ firstTierHazards: [least, most], roadId }) => {
      const hazards = trackFor(roadId).hazards.filter(
        (hazard) => hazard.rarity < FIRST_TIER_SHARE
      );
      expect(hazards.length).toBeGreaterThanOrEqual(least);
      expect(hazards.length).toBeLessThanOrEqual(most);
      expect(
        hazards.filter((hazard) => hazard.kind === "oil").length
      ).toBeGreaterThanOrEqual(1);
    }
  );

  it("Breakwater Run's first tier has every kind in about equal numbers, and oil does not take over its bends", () => {
    const hazards = trackFor("breakwater-run").hazards.filter(
      (hazard) => hazard.rarity < FIRST_TIER_SHARE
    );
    expect(
      hazardKinds.map(
        (kind) => hazards.filter((hazard) => hazard.kind === kind).length
      )
    ).toStrictEqual([5, 5, 5]);
  });

  it("on the only lane no road has a rock, or oil within reach of a sharp bend", () => {
    const onlyLane = roadIds.flatMap((roadId) =>
      [0, 1, 2, 3].flatMap((extra) => {
        const track = compileTrack({
          ...roads[roadId],
          hazardsPerKilometre: 4,
          seed: roads[roadId].seed + extra,
        });
        return track.hazards
          .filter((hazard) => openLanesAt(track, hazard.s) === 1)
          .map((hazard) => ({
            kind: hazard.kind,
            sharpest: sharpestNear(track, hazard.s),
          }));
      })
    );
    expect(onlyLane.length).toBeGreaterThan(40);
    expect(onlyLane.filter(({ kind }) => kind === "rock")).toStrictEqual([]);
    const oil = onlyLane.filter(({ kind }) => kind === "oil");
    expect(oil.length).toBeGreaterThan(0);
    expect(Math.max(...oil.map(({ sharpest }) => sharpest))).toBeLessThan(
      ONLY_LANE_OIL_CURVATURE
    );
  });

  it("oil is the most common hazard across the roads", () => {
    const kinds = roadIds.flatMap((roadId) =>
      trackFor(roadId).hazards.map((hazard) => hazard.kind)
    );
    const countOf = (kind: HazardKind) =>
      kinds.filter((each) => each === kind).length;
    expect(countOf("oil")).toBeGreaterThan(countOf("rock"));
    expect(countOf("oil")).toBeGreaterThan(countOf("pothole"));
  });

  it.each(design)(
    "every hazard on $roadId is on the road, clear of the start and the finish, and can be seen from 25 m before it",
    ({ roadId }) => {
      const track = trackFor(roadId);
      for (const hazard of track.hazards) {
        const size = hazardSizes[hazard.kind];
        expect(Math.abs(hazard.x) + size.halfWidth).toBeLessThanOrEqual(
          roadHalfWidthAt(track, hazard.s)
        );
        expect(hazard.s).toBeGreaterThanOrEqual(HAZARD_START_CLEARANCE);
        expect(hazard.s).toBeLessThanOrEqual(
          track.length - HAZARD_FINISH_CLEARANCE
        );
        expect(inSight(track, hazard.s, hazard.x)).toBeTruthy();
      }
    }
  );

  it.each(design)(
    "every hazard on $roadId lies on the lanes, never on the shoulder",
    ({ roadId }) => {
      const track = trackFor(roadId);
      for (const hazard of track.hazards) {
        expect(
          Math.abs(hazard.x) + hazardSizes[hazard.kind].halfWidth
        ).toBeLessThanOrEqual(
          openLanesAt(track, hazard.s) * track.plan.laneWidth
        );
      }
    }
  );

  it("rocks are spread across the lanes rather than lined up, and many lie where a bike rides", () => {
    const rocks = roadIds.flatMap((roadId) =>
      trackFor(roadId).hazards.flatMap((hazard) =>
        hazard.kind === "rock" ? [{ hazard, track: trackFor(roadId) }] : []
      )
    );
    const across = new Set(rocks.map(({ hazard }) => hazard.x.toFixed(1)));
    const inLane = rocks.filter(({ hazard, track }) =>
      [...track.sameWayLanes, ...track.oncomingLanes].some(
        (lane) => Math.abs(hazard.x - lane) < 1
      )
    );
    expect(across.size).toBeGreaterThan(rocks.length * 0.75);
    expect(inLane.length).toBeGreaterThan(rocks.length / 3);
  });

  it("no rock lies in a tight bend or where a bike that hits it would land in one", () => {
    const sharpest = roadIds.flatMap((roadId) => {
      const track = trackFor(roadId);
      return track.hazards
        .filter((hazard) => hazard.kind === "rock")
        .map((hazard) => sharpestNear(track, hazard.s));
    });
    expect(Math.max(...sharpest)).toBeLessThan(HAZARD_TIGHT_CURVATURE);
  });

  it("a rock in a gentle bend lies at the edge of a lane, clear of a bike holding the lane's centre", () => {
    const seededRoads = roadIds.flatMap((roadId) =>
      [0, 1, 2, 3].map((extra) =>
        extra === 0
          ? trackFor(roadId)
          : compileTrack({
              ...roads[roadId],
              seed: roads[roadId].seed + extra,
            })
      )
    );
    const gentle = seededRoads.flatMap((track) =>
      track.hazards
        .filter(
          (hazard) =>
            hazard.kind === "rock" &&
            sharpestNear(track, hazard.s) >= HAZARD_GENTLE_CURVATURE
        )
        .map((hazard) =>
          Math.min(
            ...[...track.sameWayLanes, ...track.oncomingLanes].map((lane) =>
              Math.abs(hazard.x - lane)
            )
          )
        )
    );
    expect(gentle.length).toBeGreaterThan(0);
    expect(Math.min(...gentle)).toBeGreaterThan(
      hazardSizes.rock.halfWidth + 0.38
    );
  });

  it("most hazards lie at a bend or over a crest, and the rest on the straights where riders pass traffic", () => {
    const hazards = roadIds.flatMap((roadId) => trackFor(roadId).hazards);
    const atBends = hazards.filter((hazard) => hazard.setting !== "traffic");
    expect(atBends.length).toBeGreaterThan(hazards.length / 2);
  });

  it.each(design)(
    "on $roadId a hazard mid-bend is a pothole on the inside line, and one where the bend begins is its region's kind on the outside line",
    ({ roadId, turnInKinds }) => {
      const track = trackFor(roadId);
      const across = (setting: HazardSetting) =>
        track.hazards.flatMap((hazard) => {
          if (hazard.setting !== setting) {
            return [];
          }
          const inside = Math.sign(curvatureAt(track, hazard.s));
          const lanes = track.sameWayLanes
            .slice(0, openLanesAt(track, hazard.s))
            .map((lane) => lane * inside);
          return [
            {
              innermost: hazard.x * inside - Math.max(...lanes),
              kind: hazard.kind,
              outermost: hazard.x * inside - Math.min(...lanes),
            },
          ];
        });
      for (const apex of across("apex")) {
        expect(apex.kind).toBe("pothole");
        expect(apex.innermost).toBeGreaterThanOrEqual(-1e-9);
      }
      for (const turnIn of across("turnIn")) {
        expect(turnInKinds).toContain(turnIn.kind);
        expect(turnIn.outermost).toBeLessThanOrEqual(1e-9);
      }
    }
  );

  it("hazard ids are unique on a road", () => {
    for (const roadId of roadIds) {
      const ids = trackFor(roadId).hazards.map((hazard) => hazard.id);
      expect(new Set(ids).size).toBe(ids.length);
    }
  });
});

describe("the track cache", () => {
  it("compiles a road once and hands back the same track", () => {
    expect(trackFor("slag-row")).toBe(trackFor("slag-row"));
    expect(trackFor("slag-row")).not.toBe(trackFor("ridge-road"));
  });
});
