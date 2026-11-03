import type { StagedRide } from "./keyboard.ts";
import type { BendResult, FromTheGrid } from "./probe.ts";
import type { Steering } from "./steering.ts";

const MOST_SHADOW_DIVERGENCE = 1;
const LEAST_PILOT_CORNER_SHARE = 0.8;

const mostBendsSurvivedHandsOff = new Map([
  ["breakwater-run", 5],
  ["cinder-wash", 5],
  ["hollow-pine-road", 0],
  ["madrid-gran-via", 9],
  ["madrid-hook", 4],
  ["ridge-road", 0],
  ["slag-row", 3],
]);

export interface CourseVerdict {
  readonly id: string;
  readonly braked: readonly BendResult[];
  readonly brakedFromGrid: FromTheGrid;
  readonly steering: readonly Steering[];
}

export const courseProblems = (course: CourseVerdict): readonly string[] => {
  const problems: string[] = [];
  const survived = course.braked.filter((each) => each.stayedOn).length;
  const most = mostBendsSurvivedHandsOff.get(course.id) ?? 0;
  if (survived > most) {
    problems.push(
      `${course.id}: ${survived} bends survive with the pilot's pedals and centred bars, and the limit is ${most}.`
    );
  }
  if (course.brakedFromGrid.ride.stop === "finished") {
    problems.push(
      `${course.id}: centred bars and the pilot's pedals finish the course.`
    );
  }
  for (const each of course.steering) {
    if (each.field === "alone" && (!each.finished || each.crashes > 0)) {
      problems.push(
        `${course.id}: the pilot alone did not ride clean to the finish (finished ${each.finished}, ${each.crashes} crashes).`
      );
    }
    if (each.cornerActiveShare < LEAST_PILOT_CORNER_SHARE) {
      problems.push(
        `${course.id}: the pilot steers in ${each.cornerActiveShare.toFixed(2)} of corner ticks (${each.field}), under ${LEAST_PILOT_CORNER_SHARE}.`
      );
    }
  }
  return problems;
};

export const stagedProblems = (
  rides: readonly StagedRide[]
): readonly string[] =>
  rides
    .filter((each) => each.reacting.offRoadSeconds > 0)
    .map(
      (each) =>
        `${each.course} ${each.bike}: a reacting rider left the road for ${each.reacting.offRoadSeconds.toFixed(2)} s at ${each.at} m.`
    );

export const shadowProblems = (divergence: number): readonly string[] =>
  divergence > MOST_SHADOW_DIVERGENCE
    ? [`The cloned pilot plan drifted ${divergence} m from the real pilot.`]
    : [];
