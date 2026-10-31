import { chevronRuns } from "@racer/track/chevron-runs";
import { roadIds, roadLevels } from "@racer/track/road";
import { trackFor } from "@racer/track/roads";
import { stretches, stretchIds } from "@racer/track/stretches";
import type { StretchId } from "@racer/track/stretches";
import { compileTrack, curvatureAt } from "@racer/track/track";
import type { ChevronRun, Track } from "@racer/track/track";
import { describe, expect, it } from "vitest";

import {
  brakingZonesOf,
  chevronRunsOf,
  isWarned,
  signedFor,
} from "./corner-warnings.ts";
import type { BrakingZone } from "./corner-warnings.ts";
import { player, playerFrame } from "./race-fixtures.ts";
import { createRace, defaultSetup, neutralInput, stepRace } from "./race.ts";
import { clamp, curvePushOf, steerFor, TICK_RATE } from "./state.ts";
import type { BikeSpec, RiderInput } from "./state.ts";

const trackOf = (id: StretchId): Track => compileTrack(stretches[id]);
const quietTrackOf = (id: StretchId): Track =>
  compileTrack({
    ...stretches[id],
    hazardsPerKilometre: 0,
    trafficPerKilometre: 0,
  });
const stretchTracks = stretchIds.map((id) => [id, trackOf(id)] as const);
const quietStretches = stretchIds.map((id) => [id, quietTrackOf(id)] as const);

const RIDE_LIMIT = TICK_RATE * 60;
const BOARD_GAP = 18;

const boardsOf = (track: Track) =>
  track.props.filter((prop) => prop.kind === "chevron");

const firstBoardOf = (
  boards: readonly number[],
  s: number
): number | undefined => {
  let at = boards.findLastIndex((board) => board <= s);
  if (at < 0 || s - (boards[at] ?? 0) > BOARD_GAP) {
    return undefined;
  }
  while (at > 0 && (boards[at] ?? 0) - (boards[at - 1] ?? 0) <= BOARD_GAP) {
    at -= 1;
  }
  return boards[at];
};

const metres = (value: number): string =>
  value < 10_000
    ? String(value)
    : `${Math.floor(value / 1000)}_${String(value % 1000).padStart(3, "0")}`;

const runLines = (runs: readonly ChevronRun[]): string =>
  runs
    .map(
      (run) =>
        `    { from: ${metres(run.from)}, side: ${run.side}, to: ${metres(run.to)} },\n`
    )
    .join("");

const tableOf = (): string =>
  [
    ...roadIds.map((id) => [id, chevronRunsOf(trackFor(id, 5))] as const),
    ...stretchTracks.map(([id, track]) => [id, chevronRunsOf(track)] as const),
  ]
    .toSorted(([left], [right]) => left.localeCompare(right))
    .map(([id, runs]) => `  "${id}": [\n${runLines(runs)}  ],\n`)
    .join("");

const moduleOf = (): string => `import type { RoadId } from "./road.ts";
import type { StretchId } from "./stretches.ts";
import type { ChevronRun } from "./track.ts";

export const chevronRuns = {
${tableOf()}} as const satisfies Record<RoadId | StretchId, readonly ChevronRun[]>;
`;

const brakeFromChevron = (
  track: Track,
  bike: BikeSpec,
  from: number,
  zone: BrakingZone
) => {
  const setup = defaultSetup(track, 31);
  const race = createRace({
    ...setup,
    player: { ...setup.player, bike },
    police: { ...setup.police, count: 0 },
    rivals: [],
  });
  const rider = player(race);
  rider.s = from;
  rider.bodyS = from;
  rider.x = 0;
  rider.bodyX = 0;
  rider.speed = zone.approach;
  rider.throttle = 1;
  const input: RiderInput = { ...neutralInput, throttle: 1 };
  const reacted = from + zone.approach * 0.25;
  let offRoad = false;
  for (
    let tick = 0;
    tick < RIDE_LIMIT && rider.s < zone.end && rider.mode === "riding";
    tick += 1
  ) {
    const curvature = curvatureAt(track, rider.s);
    input.steer = clamp(
      steerFor(
        bike,
        curvature,
        rider.speed,
        curvePushOf(bike, curvature, rider.speed) - 1.2 * rider.x
      ),
      -1,
      1
    );
    const braking = rider.s >= reacted && rider.speed > zone.slowest;
    input.brake = braking ? 1 : 0;
    input.throttle = rider.s < reacted || rider.speed < zone.slowest ? 1 : 0;
    stepRace(race, track, playerFrame(input));
    offRoad ||= rider.offRoad;
  }
  return { crashes: rider.crashes, offRoad, through: rider.s >= zone.end };
};

describe("corner warnings", () => {
  it("every road carries the chevron runs of its riding-speed audit", async () => {
    await expect(moduleOf()).toMatchFileSnapshot(
      "../../track/src/chevron-runs.ts"
    );
  });

  it.each(roadIds)(
    "each level of %s is warned as the whole road is up to its finish",
    (id) => {
      for (const level of roadLevels) {
        const track = trackFor(id, level);
        expect(chevronRunsOf(track)).toStrictEqual(
          chevronRuns[id].filter((run) => run.to < track.length)
        );
      }
    }
  );

  it.each(stretchTracks)(
    "every chevron run on %s has boards from its start to its end, on its side",
    (id, track) => {
      const boards = boardsOf(track);
      const runs = chevronRuns[id];
      const coverOf = (run: ChevronRun) => {
        const along = boards.filter(
          (board) => board.s >= run.from && board.s <= run.to
        );
        const stops = [...along.map((board) => board.s), run.to];
        return {
          from: along[0]?.s,
          onItsSide: along.every((board) => Math.sign(board.x) === run.side),
          spaced: stops.every((s, at) => s - (stops[at - 1] ?? s) <= BOARD_GAP),
        };
      };
      expect(runs.map(coverOf)).toStrictEqual(
        runs.map((run) => ({ from: run.from, onItsSide: true, spaced: true }))
      );
      expect(
        boards.every((board) =>
          runs.some((run) => board.s >= run.from && board.s <= run.to)
        )
      ).toBeTruthy();
    }
  );

  it.each(
    quietStretches.flatMap(([id, track]) =>
      signedFor.map((bike) => [bike.name, id, bike, track] as const)
    )
  )(
    "a %s rider who brakes at the first board before each warned bend on %s makes the bend",
    (_name, _id, bike, track) => {
      const warned = brakingZonesOf(track, bike).filter(isWarned);
      const boards = boardsOf(track).map((board) => board.s);
      const rides = warned.map((zone) => {
        const from = firstBoardOf(boards, zone.start);
        return from === undefined
          ? undefined
          : brakeFromChevron(track, bike, from, zone);
      });
      expect(warned.length).toBeGreaterThan(0);
      expect(rides).toStrictEqual(
        warned.map(() => ({ crashes: 0, offRoad: false, through: true }))
      );
    }
  );
});
