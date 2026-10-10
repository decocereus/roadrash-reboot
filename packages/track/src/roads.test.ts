import { describe, expect, it } from "vitest";

import { nextSeed } from "./random.ts";
import { roadLevels } from "./road.ts";
import type { RoadId, RoadLevel } from "./road.ts";
import { regionOf, roadIds, roads, trackFor } from "./roads.ts";
import { compileTrack } from "./track.ts";
import type { Track, TrackProp, TrackPropKind } from "./track.ts";

const GRAVITY = 9.81;
const STRAIGHT = 1 / 1500;

interface Stretch {
  readonly from: number;
  readonly to: number;
}

interface Expected {
  readonly roadId: RoadId;
  readonly lengths: readonly number[];
  readonly traffic: readonly number[];
  readonly lowestLaunch: readonly number[];
  readonly signature: Stretch | undefined;
  readonly roadblocks: readonly (readonly number[])[];
}

const design: readonly Expected[] = [
  {
    lengths: [3900, 5050, 6200, 7350, 8500],
    lowestLaunch: [169, 169, 169, 169, 169],
    roadId: "breakwater-run",
    roadblocks: [[], [], [2800, 4850], [2800, 4850], [2800, 4850, 7450]],
    signature: undefined,
    traffic: [5, 6, 7, 8, 9],
  },
  {
    lengths: [4400, 5550, 6700, 7850, 9000],
    lowestLaunch: [154, 154, 154, 154, 154],
    roadId: "cinder-wash",
    roadblocks: [
      [],
      [],
      [1900, 4600, 5800],
      [1900, 4600, 5800],
      [1900, 4600, 5800],
    ],
    signature: { from: 1640, to: 1740 },
    traffic: [3, 4, 5, 6, 7],
  },
  {
    lengths: [3600, 4750, 5900, 7050, 8200],
    lowestLaunch: [186, 173, 173, 170, 162],
    roadId: "hollow-pine-road",
    roadblocks: [[], [], [5700], [5700, 6850], [5700, 6850, 7650]],
    signature: undefined,
    traffic: [6, 7, 8, 9, 10],
  },
  {
    lengths: [4000, 5150, 6300, 7450, 8600],
    lowestLaunch: [152, 152, 152, 152, 152],
    roadId: "slag-row",
    roadblocks: [
      [],
      [],
      [750, 2150, 6150],
      [750, 2150, 6150],
      [750, 2150, 6150],
    ],
    signature: { from: 960, to: 1020 },
    traffic: [8, 9, 10, 11, 12],
  },
  {
    lengths: [4250, 5400, 6550, 7700, 8850],
    lowestLaunch: [162, 162, 162, 162, 162],
    roadId: "ridge-road",
    roadblocks: [[], [], [5250], [5250, 6650], [5250, 6650, 8650]],
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
    const inSkipped = skipped && s >= skipped.from && s <= skipped.to;
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
      expect(last.props.filter((prop) => prop.s < first.length)).toStrictEqual(
        first.props.filter((prop) => prop.s < first.length)
      );
    }
  );

  it("Ridge Road at level 1 is still the pinned road, sample for sample and prop for prop", () => {
    const levelOne = trackFor("ridge-road", 1);
    expect({
      curvature: digestOf(levelOne.curvature, 1e9),
      height: digestOf(levelOne.worldY, 1e6),
      line: digestOf([...levelOne.worldX, ...levelOne.worldZ], 1e6),
      props: digestOf(levelOne.props.flatMap(propNumbers), 1e6),
      rocks: digestOf(rocksOf(levelOne).flatMap(propNumbers), 1e6),
      slopeRate: digestOf(levelOne.slopeRate, 1e9),
    }).toStrictEqual({
      curvature: "c549d971",
      height: "5d229316",
      line: "d3195a21",
      props: "aceb06e3",
      rocks: "0356dee5",
      slopeRate: "0d92b9b9",
    });
  });

  it("the rocks on a road stay where they are when a longer lead-in scatters its trees differently", () => {
    const { plan } = roads["ridge-road"];
    const pinned = compileTrack(plan);
    const longer = compileTrack({ ...plan, leadInLength: 200 });
    expect(rocksOf(longer)).toStrictEqual(rocksOf(pinned));
    expect(rocksOf(pinned)).toHaveLength(35);
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

describe("the track cache", () => {
  it("compiles a road at a level once and hands back the same track", () => {
    expect(trackFor("slag-row", 3)).toBe(trackFor("slag-row", 3));
    expect(trackFor("slag-row", 3)).not.toBe(trackFor("slag-row", 4));
    expect(trackFor("slag-row", 3)).not.toBe(trackFor("cinder-wash", 3));
  });
});
