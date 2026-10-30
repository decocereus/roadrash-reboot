import { hazardKinds } from "@racer/track/hazards";
import type { Track } from "@racer/track/track";

import type { RaceView, RiderView } from "./race-view.ts";
import {
  cursor,
  floatListBytes,
  putChoice,
  putCount,
  putFloat,
  putText,
  refuse,
  textBytes,
} from "./snapshot-bytes.ts";
import {
  bikeFields,
  CHOICE_BYTES,
  COUNT_BYTES,
  FLOAT_BYTES,
  fixedBytesOf,
  HASH_WORDS,
  pacingFields,
  policeFields,
  profileFields,
  SNAPSHOT_FORMAT,
} from "./snapshot-format.ts";
import { hashBytes } from "./snapshot-hash.ts";
import { bikeClasses, riderRoles, weaponKinds } from "./state.ts";

const PROFILE_FIXED_BYTES = fixedBytesOf(profileFields);
const BIKE_FIXED_BYTES = fixedBytesOf(bikeFields);
const POLICE_FIXED_BYTES = fixedBytesOf(policeFields);
const PACING_FIXED_BYTES = fixedBytesOf(pacingFields);
const TRACK_FLOATS = 18;
const FEATURE_FLOATS = 7;
const PLACEMENT_FLOATS = 3;
const CAR_SETUP_FLOATS = 6;
const RIDER_SETUP_FLOATS = 3;

const laneBytes = (lanes: readonly number[]): number =>
  COUNT_BYTES + FLOAT_BYTES * lanes.length;

const trackBytes = (track: Track): number => {
  const { plan } = track;
  let total = FLOAT_BYTES * TRACK_FLOATS;
  total += textBytes(plan.id) + textBytes(plan.name) + textBytes(plan.region);
  total += laneBytes(track.sameWayLanes) + laneBytes(track.oncomingLanes);
  total += COUNT_BYTES;
  for (const feature of track.features) {
    total += textBytes(feature.id) + FLOAT_BYTES * FEATURE_FLOATS;
  }
  total += COUNT_BYTES;
  for (const placement of track.hazards) {
    total +=
      textBytes(placement.id) + CHOICE_BYTES + FLOAT_BYTES * PLACEMENT_FLOATS;
  }
  return total;
};

const riderBytes = (rider: RiderView): number =>
  PROFILE_FIXED_BYTES +
  textBytes(rider.profile.name) +
  BIKE_FIXED_BYTES +
  textBytes(rider.bike.id) +
  textBytes(rider.bike.name) +
  floatListBytes(rider.bike.gears) +
  FLOAT_BYTES * RIDER_SETUP_FLOATS;

const setupBytes = (state: RaceView, track: Track): number => {
  let total = FLOAT_BYTES + trackBytes(track);
  total += POLICE_FIXED_BYTES + PACING_FIXED_BYTES;
  total += COUNT_BYTES;
  for (const rider of state.riders) {
    total += riderBytes(rider);
  }
  total += COUNT_BYTES + state.cars.length * FLOAT_BYTES * CAR_SETUP_FLOATS;
  return total;
};

const putLanes = (out: DataView, lanes: readonly number[]): void => {
  putCount(out, lanes.length);
  for (const lane of lanes) {
    putFloat(out, lane);
  }
};

const putTrack = (out: DataView, track: Track): void => {
  const { plan } = track;
  putText(out, plan.id);
  putText(out, plan.name);
  putText(out, plan.region);
  putFloat(out, plan.level);
  putFloat(out, plan.seed);
  putFloat(out, plan.lanesEachWay);
  putFloat(out, plan.laneWidth);
  putFloat(out, plan.shoulderWidth);
  putFloat(out, plan.vergeWidth);
  putFloat(out, plan.trafficPerKilometre);
  putFloat(out, plan.hazardsPerKilometre);
  putFloat(out, plan.leadInLength);
  putFloat(out, plan.runoffLength);
  putFloat(out, track.length);
  putFloat(out, track.startS);
  putFloat(out, track.endS);
  putFloat(out, track.sampleCount);
  putFloat(out, track.roadHalfWidth);
  putFloat(out, track.vergeHalfWidth);
  putFloat(out, track.props.length);
  putFloat(out, track.solidProps.length);
  putLanes(out, track.sameWayLanes);
  putLanes(out, track.oncomingLanes);
  putCount(out, track.features.length);
  for (const feature of track.features) {
    putText(out, feature.id);
    putFloat(out, feature.s);
    putFloat(out, feature.x);
    putFloat(out, feature.fromS);
    putFloat(out, feature.toS);
    putFloat(out, feature.length);
    putFloat(out, feature.width);
    putFloat(out, feature.rise);
  }
  putCount(out, track.hazards.length);
  for (const placement of track.hazards) {
    putText(out, placement.id);
    putChoice(out, hazardKinds, placement.kind);
    putFloat(out, placement.fromLevel);
    putFloat(out, placement.s);
    putFloat(out, placement.x);
  }
};

const putRiderSetup = (out: DataView, rider: RiderView): void => {
  const { bike, profile } = rider;
  putFloat(out, rider.id);
  putFloat(out, rider.grudge ?? -1);
  putFloat(out, rider.aggressionBoost);
  putFloat(out, profile.aggression);
  putFloat(out, profile.jacket);
  putText(out, profile.name);
  putFloat(out, profile.paint);
  putChoice(out, riderRoles, profile.role);
  putFloat(out, profile.skill);
  putChoice(out, weaponKinds, profile.weapon);
  putChoice(out, bikeClasses, bike.bikeClass);
  putFloat(out, bike.brakeDeceleration);
  putFloat(out, bike.curvePush);
  putFloat(out, bike.dragFactor);
  putFloat(out, bike.engineBraking);
  putCount(out, bike.gears.length);
  for (const ratio of bike.gears) {
    putFloat(out, ratio);
  }
  putText(out, bike.id);
  putFloat(out, bike.lateralSpeed);
  putFloat(out, bike.lateralSpeedPerSpeed);
  putFloat(out, bike.launchAcceleration);
  putFloat(out, bike.leanScrub);
  putText(out, bike.name);
  putFloat(out, bike.powerPerMass);
  putFloat(out, bike.price);
  putFloat(out, bike.rollingDeceleration);
  putFloat(out, bike.steerRate);
  putFloat(out, bike.visualLean);
};

export const setupDigest = (state: RaceView, track: Track): Uint32Array => {
  const bytes = new DataView(new ArrayBuffer(setupBytes(state, track)));
  cursor.byte = 0;
  putFloat(bytes, SNAPSHOT_FORMAT);
  putTrack(bytes, track);
  putFloat(bytes, state.police.beat);
  putFloat(bytes, state.police.fine);
  putFloat(bytes, state.police.sightRange);
  putFloat(bytes, state.police.topSpeed);
  putFloat(bytes, state.pacing.catchUp);
  putFloat(bytes, state.pacing.leadEase);
  putCount(bytes, state.riders.length);
  for (const rider of state.riders) {
    putRiderSetup(bytes, rider);
  }
  putCount(bytes, state.cars.length);
  for (const car of state.cars) {
    putFloat(bytes, car.cruiseSpeed);
    putFloat(bytes, car.halfLength);
    putFloat(bytes, car.halfWidth);
    putFloat(bytes, car.height);
    putFloat(bytes, car.paint);
    putFloat(bytes, car.x);
  }
  if (cursor.byte !== bytes.byteLength) {
    refuse(
      `The setup digest wrote ${cursor.byte} of ${bytes.byteLength} bytes.`
    );
  }
  const digest = new Uint32Array(HASH_WORDS);
  hashBytes(bytes, 0, bytes.byteLength, digest);
  return digest;
};
