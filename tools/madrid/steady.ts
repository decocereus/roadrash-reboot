import * as NodeRuntime from "@effect/platform-node/NodeRuntime";
import { bikes } from "@racer/sim/bikes";
import { pilotInput } from "@racer/sim/pilot";
import { createRace, defaultSetup, stepRace } from "@racer/sim/race";
import { cruising, player } from "@racer/sim/race-fixtures";
import { TICK_RATE } from "@racer/sim/state";
import {
  compileTrack,
  curvatureAt,
  heightAt,
  placeOnTrack,
} from "@racer/track/track";
import type { Track, TrackPoint } from "@racer/track/track";
import { breakwaterRunRoad } from "@racer/track/tracks/breakwater-run";
import { cinderWashRoad } from "@racer/track/tracks/cinder-wash";
import { hollowPineRoad } from "@racer/track/tracks/hollow-pine-road";
import { madridHook } from "@racer/track/tracks/madrid-hook";
import { ridgeRoad } from "@racer/track/tracks/ridge-road";
import { slagRow } from "@racer/track/tracks/slag-row";
import * as Effect from "effect/Effect";

const SECONDS = 1 / TICK_RATE;
const STRAIGHT = 1 / 1000;
const FOLLOW = SECONDS * 12;
const LAP_LIMIT = TICK_RATE * 90;

interface Steadiness {
  readonly headingAccelerationRms: number;
  readonly headingAccelerationP99: number;
  readonly straightHeadingRateRms: number;
  readonly heightAccelerationRms: number;
  readonly heightAccelerationP99: number;
  readonly ticks: number;
}

const percentile = (values: readonly number[], share: number): number => {
  const sorted = values.toSorted((a, b) => a - b);
  return (
    sorted[Math.min(sorted.length - 1, Math.ceil(share * sorted.length) - 1)] ??
    0
  );
};

const rms = (values: readonly number[]): number =>
  Math.sqrt(
    values.reduce((total, value) => total + value * value, 0) /
      Math.max(1, values.length)
  );

const steadiness = (track: Track): Steadiness => {
  const setup = defaultSetup(track, 31);
  const race = createRace({
    ...setup,
    player: { ...setup.player, bike: bikes["ostra-sesta-600"] },
    police: { ...setup.police, count: 0 },
    rivals: [],
  });
  const rider = player(race);
  const input = { ...cruising };
  const point: TrackPoint = { heading: 0, slope: 0, x: 0, y: 0, z: 0 };
  const headingRates: number[] = [];
  const straightRates: number[] = [];
  const headingAccelerations: number[] = [];
  const heightAccelerations: number[] = [];
  let previousHeading = Number.NaN;
  let previousRate = Number.NaN;
  let previousHeight = Number.NaN;
  let previousHeightRate = Number.NaN;
  let cameraHeight = heightAt(track, 0);
  let ticks = 0;
  for (let tick = 0; tick < LAP_LIMIT && rider.finishTick < 0; tick += 1) {
    pilotInput(race, track, 0, input);
    stepRace(race, track, [input]);
    const { s: atM, x } = rider;
    placeOnTrack(track, atM, x, point);
    let { heading } = point;
    if (Number.isFinite(previousHeading)) {
      while (heading - previousHeading > Math.PI) {
        heading -= 2 * Math.PI;
      }
      while (heading - previousHeading < -Math.PI) {
        heading += 2 * Math.PI;
      }
      const rate = (heading - previousHeading) / SECONDS;
      headingRates.push(Math.abs(rate));
      if (Math.abs(curvatureAt(track, atM)) < STRAIGHT) {
        straightRates.push(rate);
      }
      if (Number.isFinite(previousRate)) {
        headingAccelerations.push(Math.abs((rate - previousRate) / SECONDS));
      }
      previousRate = rate;
    }
    const wanted = heightAt(track, atM);
    cameraHeight += (wanted - cameraHeight) * Math.min(1, FOLLOW);
    if (Number.isFinite(previousHeight)) {
      const heightRate = (cameraHeight - previousHeight) / SECONDS;
      if (Number.isFinite(previousHeightRate)) {
        heightAccelerations.push(
          Math.abs((heightRate - previousHeightRate) / SECONDS)
        );
      }
      previousHeightRate = heightRate;
    }
    previousHeading = heading;
    previousHeight = cameraHeight;
    ticks += 1;
  }
  return {
    headingAccelerationP99: percentile(headingAccelerations, 0.99),
    headingAccelerationRms: rms(headingAccelerations),
    heightAccelerationP99: percentile(heightAccelerations, 0.99),
    heightAccelerationRms: rms(heightAccelerations),
    straightHeadingRateRms: rms(straightRates),
    ticks,
  };
};

const metres = (value: number): string => value.toFixed(3);

const main = Effect.sync(() => {
  const plans = [
    breakwaterRunRoad.plan,
    cinderWashRoad.plan,
    hollowPineRoad,
    madridHook,
    ridgeRoad,
    slagRow,
  ];
  console.log(
    "| Road | Ticks | Heading acceleration RMS | Heading acceleration p99 | Straight heading rate RMS | Height acceleration RMS | Height acceleration p99 |"
  );
  console.log("| --- | --: | --: | --: | --: | --: | --: |");
  for (const plan of plans) {
    const track = compileTrack({ ...plan, trafficPerKilometre: 0 });
    const ride = steadiness(track);
    console.log(
      `| ${plan.id} | ${ride.ticks} | ${metres(ride.headingAccelerationRms)} rad/s² | ${metres(ride.headingAccelerationP99)} rad/s² | ${metres(ride.straightHeadingRateRms)} rad/s | ${metres(ride.heightAccelerationRms)} m/s² | ${metres(ride.heightAccelerationP99)} m/s² |`
    );
  }
});

NodeRuntime.runMain(main);
