import { writeFileSync } from "node:fs";
import process from "node:process";
import { parseArgs } from "node:util";

import { bikes } from "@racer/sim/bikes";
import { compileTrack } from "@racer/track/track";

import {
  courseProblems,
  shadowProblems,
  stagedProblems,
} from "./src/acceptance.ts";
import { bendsOf } from "./src/bends.ts";
import {
  courses,
  flatOut,
  pilotPedals,
  quietPlan,
  shadowDivergence,
} from "./src/course.ts";
import { compileQuiet, stagedRide } from "./src/keyboard.ts";
import { coverageOf, fromTheGrid, probeBends } from "./src/probe.ts";
import { printCourse, printStaged } from "./src/report.ts";
import { fields, pilotSteering } from "./src/steering.ts";

const SHADOW_TICKS = 6000;
const stagedOn = [
  ["madrid-hook", 125],
  ["madrid-gran-via", 1090],
] as const;

const { values } = parseArgs({
  options: {
    check: { default: false, type: "boolean" },
    json: { type: "string" },
  },
});

const problems: string[] = [];
const report: object[] = [];

for (const course of courses) {
  const quiet = compileTrack(quietPlan(course.plan));
  const full = compileTrack(course.plan);
  const bends = bendsOf(quiet);
  const flat = probeBends(quiet, bends, flatOut);
  const braked = probeBends(quiet, bends, pilotPedals);
  const flatFromGrid = fromTheGrid(quiet, bends, flatOut);
  const brakedFromGrid = fromTheGrid(quiet, bends, pilotPedals);
  const bendsFull = bendsOf(full);
  const steering = fields.map((field) =>
    field === "full"
      ? pilotSteering(full, bendsFull, field)
      : pilotSteering(quiet, bends, field)
  );
  const measured = {
    bends: bends.length,
    braked,
    brakedCoverage: coverageOf(braked.rail, bends),
    brakedFromGrid,
    flat,
    flatCoverage: coverageOf(flat.rail, bends),
    flatFromGrid,
    id: course.id,
    length: quiet.length,
    name: course.plan.name,
    roadHalfWidth: quiet.roadHalfWidth,
    steering,
  };
  if (!values.check) {
    printCourse(measured);
  }
  problems.push(
    ...courseProblems({
      braked: braked.results,
      brakedFromGrid,
      id: course.id,
      steering,
    })
  );
  report.push({
    ...measured,
    braked: braked.results,
    brakedFromGrid: {
      bendsCleared: brakedFromGrid.bendsCleared,
      failedBend: brakedFromGrid.failedBend,
      stop: brakedFromGrid.ride.stop,
      stopS: brakedFromGrid.ride.stopS,
    },
    flat: flat.results,
    flatFromGrid: {
      bendsCleared: flatFromGrid.bendsCleared,
      failedBend: flatFromGrid.failedBend,
      stop: flatFromGrid.ride.stop,
      stopS: flatFromGrid.ride.stopS,
    },
  });
}

const staged = stagedOn.flatMap(([id, at]) => {
  const course = courses.find((each) => each.id === id);
  if (!course) {
    throw new Error(`No course ${id}.`);
  }
  const track = compileQuiet(course.plan);
  return [bikes["ostra-sesta-600"], bikes["halden-wren-400"]].map((on) =>
    stagedRide(id, track, on, at)
  );
});
problems.push(...stagedProblems(staged));

const ridge = courses.find((each) => each.id === "ridge-road");
if (ridge) {
  problems.push(
    ...shadowProblems(shadowDivergence(compileQuiet(ridge.plan), SHADOW_TICKS))
  );
}

if (values.json !== undefined) {
  writeFileSync(
    values.json,
    `${JSON.stringify({ courses: report, staged }, null, 2)}\n`
  );
}

if (values.check) {
  for (const problem of problems) {
    process.stderr.write(`${problem}\n`);
  }
  process.exitCode = problems.length > 0 ? 1 : 0;
} else {
  printStaged(staged);
  for (const problem of problems) {
    process.stdout.write(`PROBLEM ${problem}\n`);
  }
}
