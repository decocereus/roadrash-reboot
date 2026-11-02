import process from "node:process";

import type { StagedRide } from "./keyboard.ts";
import type { Coverage, FromTheGrid, Probe } from "./probe.ts";
import type { Steering } from "./steering.ts";

interface Measured {
  readonly bends: number;
  readonly braked: Probe;
  readonly brakedCoverage: Coverage;
  readonly brakedFromGrid: FromTheGrid;
  readonly flat: Probe;
  readonly flatCoverage: Coverage;
  readonly flatFromGrid: FromTheGrid;
  readonly id: string;
  readonly length: number;
  readonly name: string;
  readonly roadHalfWidth: number;
  readonly steering: readonly Steering[];
}

const say = (line = ""): void => {
  process.stdout.write(`${line}\n`);
};

const fixed = (value: number, digits = 1): string => value.toFixed(digits);
const percent = (value: number): string => `${(value * 100).toFixed(0)}%`;

const table = (title: string, probe: Probe): void => {
  say(`  ${title}`);
  say(
    "    #   from-to m        turn   R m    entry km/h  push/lim  |x|pk  drift  half  result    carried"
  );
  for (const each of probe.results) {
    const held = each.heldLine ? "held" : "on road";
    const result = each.stayedOn ? held : each.outcome;
    say(
      `    ${String(each.bend).padStart(2)}  ${`${each.from}-${each.to}`.padEnd(15)}  ${fixed(each.turnDegrees).padStart(5)}  ${fixed(each.radius, 0).padStart(5)}  ${fixed(each.entryKmh, 0).padStart(9)}  ${fixed(each.peakPushShare, 2).padStart(8)}  ${fixed(each.peakAbsX, 2).padStart(5)}  ${fixed(each.peakDrift, 2).padStart(5)}  ${fixed(each.roadHalfWidth).padStart(4)}  ${result.padEnd(8)}  ${percent(each.absorbed).padStart(4)}`
    );
  }
};

const headline = (name: string, bends: number, probe: Probe): void => {
  const { results } = probe;
  const stayed = results.filter((each) => each.stayedOn).length;
  const held = results.filter((each) => each.heldLine).length;
  const skipped =
    results.length < bends
      ? `; rail ${probe.rail.stop} at ${fixed(probe.rail.stopS, 0)} m, ${bends - results.length} later bends unprobed`
      : "";
  say(
    `  HEADLINE ${name}: ${stayed}/${results.length} stayed on the road with centred bars, ${held} held within 1 m of their line${skipped}`
  );
};

const gridLine = (name: string, run: FromTheGrid): void => {
  const cause = run.ride.cause === null ? "" : ` (${run.ride.cause})`;
  const failed = run.failedBend === null ? "" : ` in bend ${run.failedBend}`;
  say(
    `  From the grid, ${name}: ${run.ride.stop}${cause} at ${fixed(run.ride.stopS, 0)} m${failed}, ${run.bendsCleared} bends cleared`
  );
};

export const printCourse = (course: Measured): void => {
  say(
    `== ${course.id} (${course.name}), ${fixed(course.length, 0)} m, half width ${course.roadHalfWidth} m, ${course.bends} bends`
  );
  table("Flat out, centred bars:", course.flat);
  table("Pilot's pedals, centred bars:", course.braked);
  headline("flat out", course.bends, course.flat);
  if (course.flat.lifts.length > 0) {
    say(
      `    flat out crashed landing off a crest at ${course.flat.lifts.join(", ")} m; that stretch rode the pilot's pedals`
    );
  }
  headline("pilot's pedals", course.bends, course.braked);
  gridLine("flat out", course.flatFromGrid);
  gridLine("pilot's pedals", course.brakedFromGrid);
  say(
    `  Bend metres the settled lean carries: flat out ${percent(course.flatCoverage.carriedShare)}, pilot's pedals ${percent(course.brakedCoverage.carriedShare)}; beyond full lock: ${percent(course.flatCoverage.beyondLockShare)}, ${percent(course.brakedCoverage.beyondLockShare)}`
  );
  for (const each of course.steering) {
    say(
      `  Pilot steering (${each.field}): ${fixed(each.km, 2)} km in ${fixed(each.ticks / 60)} s${each.finished ? "" : " (did not finish)"}, ${each.crashes} crashes, |steer| travel ${fixed(each.steerTravelPerKm)}/km, ${fixed(each.reversalsPerKm)} reversals/km, steering on ${percent(each.cornerActiveShare)} of corner ticks and ${percent(each.straightActiveShare)} of straight ticks, mean |steer| in corners ${fixed(each.cornerMeanAbsSteer, 2)}`
    );
  }
  say();
};

export const printStaged = (rides: readonly StagedRide[]): void => {
  say(
    "Three seconds at 190 km/h on a Madrid stretch, from the lane the grid uses:"
  );
  for (const each of rides) {
    say(
      `  ${each.course} at ${each.at} m, ${each.bike}: centred bars ${fixed(each.centred.widest, 2)} m wide, ${fixed(each.centred.offRoadSeconds, 2)} s off road; reacting rider ${fixed(each.reacting.widest, 2)} m wide, ${fixed(each.reacting.offRoadSeconds, 2)} s off road, ${each.presses} key presses`
    );
  }
};
