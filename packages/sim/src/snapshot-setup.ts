import type { CrossRoad, Lights, TrackCrossing } from "@racer/track/crossings";
import type { TrackFeature } from "@racer/track/features";
import type { HazardPlacement } from "@racer/track/hazards";
import type { Track, TrackPlan, TrackProp } from "@racer/track/track";

import type { RaceView, RiderView, TrafficView } from "./race-view.ts";
import { cursor, HASH_WORDS, refuse } from "./snapshot-bytes.ts";
import { SNAPSHOT_FORMAT } from "./snapshot-format.ts";
import type {
  CarSetupKey,
  RaceSetupKey,
  RiderSetupKey,
} from "./snapshot-format.ts";
import { hashBytes } from "./snapshot-hash.ts";
import {
  bytesOf,
  floatAt,
  floatsAt,
  putRecord,
  riderAt,
  riderRefAt,
  samplesAt,
  textAt,
  writtenListAt,
  writtenRecordAt,
  writtenRecordOrNoneAt,
  writtenSchemaOf,
} from "./snapshot-members.ts";
import type { WrittenSchema } from "./snapshot-members.ts";
import type {
  BikeSpec,
  PacingRules,
  PoliceRules,
  RiderProfile,
} from "./state.ts";

type PlanKey =
  | "hazardsPerKilometre"
  | "id"
  | "lanesEachWay"
  | "laneWidth"
  | "level"
  | "name"
  | "region"
  | "seed"
  | "shoulderWidth"
  | "trafficPerKilometre"
  | "vergeWidth";

const planSchema = writtenSchemaOf<Pick<TrackPlan, PlanKey>>({
  hazardsPerKilometre: floatAt("hazardsPerKilometre"),
  id: textAt("id"),
  laneWidth: floatAt("laneWidth"),
  lanesEachWay: floatAt("lanesEachWay"),
  level: floatAt("level"),
  name: textAt("name"),
  region: textAt("region"),
  seed: floatAt("seed"),
  shoulderWidth: floatAt("shoulderWidth"),
  trafficPerKilometre: floatAt("trafficPerKilometre"),
  vergeWidth: floatAt("vergeWidth"),
});

const propSchema = writtenSchemaOf<TrackProp>({
  kind: textAt("kind"),
  radius: floatAt("radius"),
  s: floatAt("s"),
  scale: floatAt("scale"),
  x: floatAt("x"),
});

const featureSchema = writtenSchemaOf<TrackFeature>({
  fromS: floatAt("fromS"),
  id: textAt("id"),
  kind: textAt("kind"),
  length: floatAt("length"),
  rise: floatAt("rise"),
  s: floatAt("s"),
  toS: floatAt("toS"),
  width: floatAt("width"),
  x: floatAt("x"),
});

const lightsSchema = writtenSchemaOf<Lights>({
  offsetTicks: floatAt("offsetTicks"),
});

const crossRoadSchema = writtenSchemaOf<CrossRoad>({
  arms: textAt("arms"),
  laneWidth: floatAt("laneWidth"),
  lanesEachWay: floatAt("lanesEachWay"),
});

const crossingSchema = writtenSchemaOf<TrackCrossing>({
  boxHalfLength: floatAt("boxHalfLength"),
  fromS: floatAt("fromS"),
  id: textAt("id"),
  lights: writtenRecordOrNoneAt("lights", lightsSchema),
  road: writtenRecordOrNoneAt("road", crossRoadSchema),
  s: floatAt("s"),
  stopGap: floatAt("stopGap"),
  toS: floatAt("toS"),
  walk: textAt("walk"),
});

const placementSchema = writtenSchemaOf<HazardPlacement>({
  fromLevel: floatAt("fromLevel"),
  id: textAt("id"),
  kind: textAt("kind"),
  s: floatAt("s"),
  setting: textAt("setting"),
  x: floatAt("x"),
});

const trackSchema: WrittenSchema<Omit<Track, "featureIndex">> = writtenSchemaOf<
  Omit<Track, "featureIndex">
>({
  crossings: writtenListAt("crossings", crossingSchema),
  curvature: samplesAt("curvature"),
  endS: floatAt("endS"),
  features: writtenListAt("features", featureSchema),
  hazards: writtenListAt("hazards", placementSchema),
  heading: samplesAt("heading"),
  length: floatAt("length"),
  oncomingLanes: samplesAt("oncomingLanes"),
  plan: writtenRecordAt("plan", planSchema),
  props: writtenListAt("props", propSchema),
  roadHalfWidth: floatAt("roadHalfWidth"),
  sameWayLanes: samplesAt("sameWayLanes"),
  sampleCount: floatAt("sampleCount"),
  slope: samplesAt("slope"),
  slopeRate: samplesAt("slopeRate"),
  solidProps: writtenListAt("solidProps", propSchema),
  startS: floatAt("startS"),
  vergeHalfWidth: floatAt("vergeHalfWidth"),
  worldX: samplesAt("worldX"),
  worldY: samplesAt("worldY"),
  worldZ: samplesAt("worldZ"),
});

const profileSchema = writtenSchemaOf<RiderProfile>({
  aggression: floatAt("aggression"),
  jacket: floatAt("jacket"),
  name: textAt("name"),
  paint: floatAt("paint"),
  role: textAt("role"),
  skill: floatAt("skill"),
  weapon: textAt("weapon"),
});

const bikeSchema = writtenSchemaOf<BikeSpec>({
  bikeClass: textAt("bikeClass"),
  brakeDeceleration: floatAt("brakeDeceleration"),
  curvePush: floatAt("curvePush"),
  dragFactor: floatAt("dragFactor"),
  engineBraking: floatAt("engineBraking"),
  gears: floatsAt("gears"),
  id: textAt("id"),
  lateralSpeed: floatAt("lateralSpeed"),
  lateralSpeedPerSpeed: floatAt("lateralSpeedPerSpeed"),
  launchAcceleration: floatAt("launchAcceleration"),
  leanScrub: floatAt("leanScrub"),
  name: textAt("name"),
  powerPerMass: floatAt("powerPerMass"),
  price: floatAt("price"),
  rollingDeceleration: floatAt("rollingDeceleration"),
  steerRate: floatAt("steerRate"),
  visualLean: floatAt("visualLean"),
});

const policeSchema = writtenSchemaOf<PoliceRules>({
  beat: floatAt("beat"),
  fine: floatAt("fine"),
  sightRange: floatAt("sightRange"),
  topSpeed: floatAt("topSpeed"),
});

const pacingSchema = writtenSchemaOf<PacingRules>({
  catchUp: floatAt("catchUp"),
  leadEase: floatAt("leadEase"),
});

const riderSetupSchema = writtenSchemaOf<Pick<RiderView, RiderSetupKey>>({
  aggressionBoost: floatAt("aggressionBoost"),
  bike: writtenRecordAt("bike", bikeSchema),
  grudge: riderRefAt("grudge"),
  id: riderAt("id"),
  profile: writtenRecordAt("profile", profileSchema),
});

const carSetupSchema = writtenSchemaOf<Pick<TrafficView, CarSetupKey>>({
  cruiseSpeed: floatAt("cruiseSpeed"),
  halfLength: floatAt("halfLength"),
  halfWidth: floatAt("halfWidth"),
  height: floatAt("height"),
  paint: floatAt("paint"),
  x: floatAt("x"),
});

type SetupListKey = "cars" | "riders";

const raceSetupSchema = writtenSchemaOf<
  Pick<RaceView, RaceSetupKey | SetupListKey>
>({
  cars: writtenListAt("cars", carSetupSchema),
  pacing: writtenRecordAt("pacing", pacingSchema),
  police: writtenRecordAt("police", policeSchema),
  riders: writtenListAt("riders", riderSetupSchema),
});

interface SetupSource {
  readonly format: number;
  readonly race: RaceView;
  readonly track: Track;
}

const setupSchema = writtenSchemaOf<SetupSource>({
  format: floatAt("format"),
  race: writtenRecordAt("race", raceSetupSchema),
  track: writtenRecordAt("track", trackSchema),
});

export const setupDigest = (state: RaceView, track: Track): Uint32Array => {
  const source: SetupSource = {
    format: SNAPSHOT_FORMAT,
    race: state,
    track,
  };
  const bytes = new DataView(new ArrayBuffer(bytesOf(setupSchema, source)));
  cursor.byte = 0;
  putRecord(bytes, setupSchema, source);
  if (cursor.byte !== bytes.byteLength) {
    refuse(
      `The setup digest wrote ${cursor.byte} of ${bytes.byteLength} bytes.`
    );
  }
  const digest = new Uint32Array(HASH_WORDS);
  hashBytes(bytes, 0, bytes.byteLength, digest);
  return digest;
};
