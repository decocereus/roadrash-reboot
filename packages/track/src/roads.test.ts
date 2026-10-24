import { describe, expect, it } from "vitest";

import { chevronRuns } from "./chevron-runs.ts";
import { reservationOf } from "./features.ts";
import {
  HAZARD_FINISH_CLEARANCE,
  HAZARD_GENTLE_CURVATURE,
  HAZARD_RAMP_CLEARANCE,
  HAZARD_START_CLEARANCE,
  HAZARD_TIGHT_CURVATURE,
  hazardSizes,
  inSight,
} from "./hazards.ts";
import type { HazardKind, HazardSetting } from "./hazards.ts";
import { nextSeed } from "./random.ts";
import { roadIds, roadLevels } from "./road.ts";
import type { RoadId, RoadLevel } from "./road.ts";
import { regionOf, roads, trackFor } from "./roads.ts";
import { compileTrack, curvatureAt } from "./track.ts";
import type { Track, TrackProp, TrackPropKind } from "./track.ts";

const GRAVITY = 9.81;
const STRAIGHT = 1 / 1500;
const PINNED_RIDGE_LENGTH = 4250;
const RAMP_RUN_UP = 40;

interface Stretch {
  readonly from: number;
  readonly to: number;
}

interface Expected {
  readonly roadId: RoadId;
  readonly lengths: readonly number[];
  readonly traffic: readonly number[];
  readonly lowestLaunch: readonly number[];
  readonly ramps: readonly (readonly string[])[];
  readonly signature: Stretch | undefined;
  readonly roadblocks: readonly (readonly number[])[];
}

const design: readonly Expected[] = [
  {
    lengths: [8500, 9650, 10_800, 11_950, 13_100],
    lowestLaunch: [169, 169, 169, 169, 169],
    ramps: [
      ["promenade-ramp", "mole-ramp"],
      ["promenade-ramp", "mole-ramp"],
      ["promenade-ramp", "mole-ramp"],
      ["promenade-ramp", "mole-ramp"],
      ["promenade-ramp", "mole-ramp"],
    ],
    roadId: "breakwater-run",
    roadblocks: [[], [], [2800, 9450], [2800, 9450], [2800, 9450, 12_050]],
    signature: undefined,
    traffic: [5, 6, 7, 8, 9],
  },
  {
    lengths: [8850, 10_000, 11_150, 12_300, 13_450],
    lowestLaunch: [154, 154, 154, 154, 154],
    ramps: [
      ["drive-in-ramp", "salt-pan-ramp"],
      ["drive-in-ramp", "salt-pan-ramp"],
      ["drive-in-ramp", "salt-pan-ramp"],
      ["drive-in-ramp", "salt-pan-ramp"],
      ["drive-in-ramp", "salt-pan-ramp"],
    ],
    roadId: "cinder-wash",
    roadblocks: [
      [],
      [],
      [1900, 9050, 10_250],
      [1900, 9050, 10_250],
      [1900, 9050, 10_250],
    ],
    signature: { from: 1640, to: 1740 },
    traffic: [3, 4, 5, 6, 7],
  },
  {
    lengths: [8050, 9200, 10_350, 11_500, 12_650],
    lowestLaunch: [186, 173, 173, 170, 162],
    ramps: [
      ["sawmill-ramp", "kiln-ramp"],
      ["sawmill-ramp", "kiln-ramp"],
      ["sawmill-ramp", "kiln-ramp"],
      ["sawmill-ramp", "kiln-ramp"],
      ["sawmill-ramp", "kiln-ramp"],
    ],
    roadId: "hollow-pine-road",
    roadblocks: [[], [], [10_150], [10_150, 11_300], [10_150, 11_300, 12_100]],
    signature: undefined,
    traffic: [6, 7, 8, 9, 10],
  },
  {
    lengths: [8500, 9650, 10_800, 11_950, 13_100],
    lowestLaunch: [152, 152, 152, 152, 152],
    ramps: [
      ["slipway-ramp", "bonded-ramp"],
      ["slipway-ramp", "bonded-ramp"],
      ["slipway-ramp", "bonded-ramp"],
      ["slipway-ramp", "bonded-ramp", "boulevard-ramp"],
      ["slipway-ramp", "bonded-ramp", "boulevard-ramp"],
    ],
    roadId: "slag-row",
    roadblocks: [
      [],
      [],
      [750, 2150, 10_650],
      [750, 2150, 10_650],
      [750, 2150, 10_650],
    ],
    signature: { from: 960, to: 1020 },
    traffic: [8, 9, 10, 11, 12],
  },
  {
    lengths: [8550, 9700, 10_850, 12_000, 13_150],
    lowestLaunch: [162, 162, 162, 162, 162],
    ramps: [
      ["cable-car-ramp"],
      ["cable-car-ramp"],
      ["cable-car-ramp"],
      ["cable-car-ramp"],
      ["cable-car-ramp"],
    ],
    roadId: "ridge-road",
    roadblocks: [[], [], [9550], [9550, 10_950], [9550, 10_950, 12_950]],
    signature: undefined,
    traffic: [5, 6, 7, 8, 9],
  },
];

const everyLevel = <Value>(measure: (level: RoadLevel) => Value): Value[] =>
  roadLevels.map((level) => measure(level));

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

const bendAt = (track: Track, s: number): number =>
  Math.abs(track.curvature[Math.round(s - track.startS)] ?? 0);

const straightBehind = (track: Track, s: number): number => {
  let metres = 0;
  while (s - metres > track.startS && bendAt(track, s - metres) === 0) {
    metres += 1;
  }
  return metres;
};

const straightAhead = (track: Track, s: number): number => {
  let metres = 0;
  while (s + metres < track.length && bendAt(track, s + metres) === 0) {
    metres += 1;
  }
  return metres;
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

describe("the five roads", () => {
  it("the registry lists the five roads in career order with their regions", () => {
    expect(roadIds.map((roadId) => [roadId, regionOf(roadId)])).toStrictEqual([
      ["breakwater-run", "salt-coast"],
      ["cinder-wash", "cinder-flats"],
      ["hollow-pine-road", "kettle-woods"],
      ["slag-row", "lowtown"],
      ["ridge-road", "stonepeak"],
    ]);
  });

  it.each(design)(
    "$roadId is the designed length at every level and each level adds 1,150 m",
    ({ lengths, roadId }) => {
      const compiled = everyLevel((level) => trackFor(roadId, level).length);
      for (const [index, length] of compiled.entries()) {
        expect(Math.abs(length - (lengths[index] ?? 0))).toBeLessThan(10);
      }
      expect(
        compiled
          .slice(1)
          .map((length, index) => length - (compiled[index] ?? 0))
      ).toStrictEqual([1150, 1150, 1150, 1150]);
    }
  );

  it.each(design)(
    "$roadId carries its level, its traffic, and its road name at every level",
    ({ roadId, traffic }) => {
      const plans = everyLevel((level) => trackFor(roadId, level).plan);
      expect(plans.map((plan) => plan.level)).toStrictEqual([1, 2, 3, 4, 5]);
      expect(plans.map((plan) => plan.trafficPerKilometre)).toStrictEqual(
        traffic
      );
      expect(new Set(plans.map((plan) => plan.name)).size).toBe(1);
      expect(new Set(plans.map((plan) => plan.region))).toStrictEqual(
        new Set([regionOf(roadId)])
      );
    }
  );

  it.each(design)(
    "a later level of $roadId starts with the road the player already knows",
    ({ roadId }) => {
      const first = trackFor(roadId, 1);
      const last = trackFor(roadId, 5);
      const known = first.length - first.startS;
      expect(last.curvature.slice(0, known)).toStrictEqual(
        first.curvature.slice(0, known)
      );
      expect(last.worldY.slice(0, known)).toStrictEqual(
        first.worldY.slice(0, known)
      );
      const ahead = chevronRuns[roadId].filter((run) => run.to >= first.length);
      const knownProp = (prop: TrackProp): boolean =>
        prop.s < first.length &&
        !(
          prop.kind === "chevron" &&
          ahead.some((run) => prop.s >= run.from && prop.s <= run.to)
        );
      expect(last.props.filter(knownProp)).toStrictEqual(
        first.props.filter(knownProp)
      );
    }
  );

  it("the first 4,250 m of Ridge Road at level 1 are still the pinned road, sample for sample and prop for prop", () => {
    const levelOne = trackFor("ridge-road", 1);
    const samples = PINNED_RIDGE_LENGTH - levelOne.startS;
    const props = levelOne.props.filter((prop) => prop.s < PINNED_RIDGE_LENGTH);
    expect({
      curvature: digestOf(levelOne.curvature.slice(0, samples), 1e9),
      height: digestOf(levelOne.worldY.slice(0, samples), 1e6),
      line: digestOf(
        [
          ...levelOne.worldX.slice(0, samples),
          ...levelOne.worldZ.slice(0, samples),
        ],
        1e6
      ),
      props: digestOf(props.flatMap(propNumbers), 1e6),
      rocks: digestOf(
        props.filter((prop) => prop.kind === "rock").flatMap(propNumbers),
        1e6
      ),
      slopeRate: digestOf(levelOne.slopeRate.slice(0, samples), 1e9),
    }).toStrictEqual({
      curvature: "becd6387",
      height: "bdd0d924",
      line: "cbabb60b",
      props: "a50b5fda",
      rocks: "0356dee5",
      slopeRate: "1656c28f",
    });
  });

  it("the rocks on a road stay where they are when a longer lead-in scatters its trees differently", () => {
    const { plan } = roads["ridge-road"];
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
    "the lowest launch speed on $roadId matches the design at every level",
    ({ lowestLaunch, roadId }) => {
      const measured = everyLevel((level) =>
        lowestLaunchKmh(trackFor(roadId, level))
      );
      for (const [index, kmh] of measured.entries()) {
        expect(Math.abs(kmh - (lowestLaunch[index] ?? 0))).toBeLessThan(3);
      }
    }
  );

  it.each(design)(
    "nothing on $roadId but its signature crest launches below 160 km/h",
    ({ roadId, signature }) => {
      const measured = everyLevel((level) =>
        lowestLaunchKmh(trackFor(roadId, level), signature)
      );
      expect(Math.min(...measured)).toBeGreaterThan(160);
    }
  );
});

describe("roadblock spots", () => {
  it.each(design)(
    "$roadId has the designed spots at each level",
    ({ roadId, roadblocks }) => {
      expect(
        everyLevel((level) => trackFor(roadId, level).plan.roadblocks)
      ).toStrictEqual(roadblocks);
    }
  );

  it.each(design)(
    "every spot on $roadId is on a straight, 250 m past the last bend and 150 m before the next",
    ({ roadId }) => {
      const spots = everyLevel((level) => {
        const track = trackFor(roadId, level);
        return track.plan.roadblocks.map((s) => ({
          ahead: straightAhead(track, s),
          behind: straightBehind(track, s),
          bend: bendAt(track, s),
        }));
      }).flat();
      expect(spots.length).toBeGreaterThan(0);
      for (const spot of spots) {
        expect(spot.bend).toBeLessThan(STRAIGHT);
        expect(spot.behind).toBeGreaterThanOrEqual(250);
        expect(spot.ahead).toBeGreaterThanOrEqual(150);
      }
    }
  );
});

describe("ramps", () => {
  it.each(design)(
    "$roadId has its ramps at each level",
    ({ ramps, roadId }) => {
      expect(
        everyLevel((level) =>
          trackFor(roadId, level).features.map((feature) => feature.id)
        )
      ).toStrictEqual(ramps);
    }
  );

  it.each(design)(
    "every ramp on $roadId sits on a straight from 40 m before the toe to the end of its landing, with no crest and no roadblock near it",
    ({ roadId }) => {
      const ramps = everyLevel((level) => {
        const track = trackFor(roadId, level);
        return track.features.map((feature) => {
          let bend = 0;
          let sharpest = 0;
          for (let s = feature.fromS; s <= feature.toS; s += 1) {
            sharpest = Math.min(
              sharpest,
              track.slopeRate[Math.round(s - track.startS)] ?? 0
            );
            if (s >= feature.s - RAMP_RUN_UP) {
              bend = Math.max(bend, bendAt(track, s));
            }
          }
          const nearestRoadblock = Math.min(
            Number.POSITIVE_INFINITY,
            ...track.plan.roadblocks.map((spot) =>
              Math.max(0, feature.fromS - spot, spot - feature.toS)
            )
          );
          return { bend, nearestRoadblock, sharpest };
        });
      }).flat();
      expect(ramps.length).toBeGreaterThan(0);
      for (const ramp of ramps) {
        expect(ramp.bend).toBeLessThan(STRAIGHT);
        expect(ramp.sharpest).toBeGreaterThan(-GRAVITY / (200 / 3.6) ** 2);
        expect(ramp.nearestRoadblock).toBeGreaterThanOrEqual(100);
      }
    }
  );
});

describe("hazards", () => {
  it.each(design)(
    "$roadId has a handful of hazards at level 1, at least one an oil slick, and more at every level after",
    ({ roadId }) => {
      const counts = everyLevel(
        (level) => trackFor(roadId, level).hazards.length
      );
      const slicks = trackFor(roadId, 1).hazards.filter(
        (hazard) => hazard.kind === "oil"
      );
      expect(counts[0]).toBeGreaterThanOrEqual(4);
      expect(counts[0]).toBeLessThanOrEqual(7);
      expect(slicks.length).toBeGreaterThanOrEqual(1);
      for (const [index, count] of counts.slice(1).entries()) {
        expect(count).toBeGreaterThanOrEqual(counts[index] ?? 0);
      }
      expect(counts[4]).toBeGreaterThanOrEqual((counts[0] ?? 0) * 2);
    }
  );

  it.each(roadLevels)(
    "oil is the most common hazard across the roads at level %i",
    (level) => {
      const kinds = roadIds.flatMap((roadId) =>
        trackFor(roadId, level).hazards.map((hazard) => hazard.kind)
      );
      const countOf = (kind: HazardKind) =>
        kinds.filter((each) => each === kind).length;
      expect(countOf("oil")).toBeGreaterThan(countOf("rock"));
      expect(countOf("oil")).toBeGreaterThan(countOf("pothole"));
    }
  );

  it.each(design)(
    "every hazard on $roadId at level 1 is in the same place at every later level",
    ({ roadId }) => {
      const first = trackFor(roadId, 1).hazards;
      for (const level of roadLevels) {
        const later = trackFor(roadId, level).hazards;
        for (const hazard of first) {
          expect(later).toContainEqual(hazard);
        }
      }
    }
  );

  it.each(design)(
    "every hazard on $roadId is on the road, clear of the start, the finish, and every ramp, and can be seen from 25 m before it",
    ({ roadId }) => {
      for (const level of roadLevels) {
        const track = trackFor(roadId, level);
        for (const hazard of track.hazards) {
          const size = hazardSizes[hazard.kind];
          expect(Math.abs(hazard.x) + size.halfWidth).toBeLessThanOrEqual(
            track.roadHalfWidth
          );
          expect(hazard.s).toBeGreaterThanOrEqual(HAZARD_START_CLEARANCE);
          expect(hazard.s).toBeLessThanOrEqual(
            track.length - HAZARD_FINISH_CLEARANCE
          );
          for (const rule of roads[roadId].plan.features) {
            const [from, to] = reservationOf(rule);
            const clear =
              hazard.s + size.halfLength < from - HAZARD_RAMP_CLEARANCE ||
              hazard.s - size.halfLength > to + HAZARD_RAMP_CLEARANCE;
            expect(clear).toBeTruthy();
          }
          expect(inSight(track, hazard.s, hazard.x)).toBeTruthy();
          expect(hazard.fromLevel).toBeLessThanOrEqual(level);
        }
      }
    }
  );

  it.each(design)(
    "every hazard on $roadId lies on the lanes, never on the shoulder",
    ({ roadId }) => {
      const track = trackFor(roadId, 5);
      const lanesEdge = track.plan.lanesEachWay * track.plan.laneWidth;
      for (const hazard of track.hazards) {
        expect(
          Math.abs(hazard.x) + hazardSizes[hazard.kind].halfWidth
        ).toBeLessThanOrEqual(lanesEdge);
      }
    }
  );

  it("rocks are spread across the lanes rather than lined up, and many lie where a bike rides", () => {
    const rocks = roadIds.flatMap((roadId) =>
      trackFor(roadId, 5).hazards.flatMap((hazard) =>
        hazard.kind === "rock" ? [{ hazard, track: trackFor(roadId, 5) }] : []
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
    const sharpest = roadIds.flatMap((roadId) =>
      roadLevels.flatMap((level) => {
        const track = trackFor(roadId, level);
        return track.hazards
          .filter((hazard) => hazard.kind === "rock")
          .map((hazard) => sharpestNear(track, hazard.s));
      })
    );
    expect(Math.max(...sharpest)).toBeLessThan(HAZARD_TIGHT_CURVATURE);
  });

  it("a rock in a gentle bend lies at the edge of a lane, clear of a bike holding the lane's centre", () => {
    const gentle = roadIds.flatMap((roadId) => {
      const track = trackFor(roadId, 5);
      return track.hazards
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
        );
    });
    expect(gentle.length).toBeGreaterThan(0);
    expect(Math.min(...gentle)).toBeGreaterThan(
      hazardSizes.rock.halfWidth + 0.38
    );
  });

  it("most hazards lie at a bend or over a crest, and the rest on the straights where riders pass traffic", () => {
    const hazards = roadIds.flatMap((roadId) => trackFor(roadId, 5).hazards);
    const atBends = hazards.filter((hazard) => hazard.setting !== "traffic");
    expect(atBends.length).toBeGreaterThan(hazards.length / 2);
  });

  it.each(design)(
    "on $roadId a hazard mid-bend is a pothole on the inside line, and one where the bend begins is oil on the outside line",
    ({ roadId }) => {
      const track = trackFor(roadId, 5);
      const across = (setting: HazardSetting) =>
        track.hazards.flatMap((hazard) => {
          if (hazard.setting !== setting) {
            return [];
          }
          const inside = Math.sign(curvatureAt(track, hazard.s));
          const lanes = track.sameWayLanes.map((lane) => lane * inside);
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
        expect(turnIn.kind).toBe("oil");
        expect(turnIn.outermost).toBeLessThanOrEqual(1e-9);
      }
    }
  );

  it("hazard ids are unique on a road", () => {
    for (const roadId of roadIds) {
      const ids = trackFor(roadId, 5).hazards.map((hazard) => hazard.id);
      expect(new Set(ids).size).toBe(ids.length);
    }
  });
});

describe("the track cache", () => {
  it("compiles a road at a level once and hands back the same track", () => {
    expect(trackFor("slag-row", 3)).toBe(trackFor("slag-row", 3));
    expect(trackFor("slag-row", 3)).not.toBe(trackFor("slag-row", 4));
    expect(trackFor("slag-row", 3)).not.toBe(trackFor("cinder-wash", 3));
  });
});
