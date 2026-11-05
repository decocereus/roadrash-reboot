import type { CrossRoad, Lights, TrackCrossing } from "@racer/track/crossings";
import type { District } from "@racer/track/districts";
import type { HazardPlacement } from "@racer/track/hazards";
import type { StallFootprint } from "@racer/track/stalls";
import type { Track, TrackPlan, TrackProp } from "@racer/track/track";
import type { WalkSite } from "@racer/track/walk-sites";

import type {
  CrossCarView,
  PedestrianView,
  RaceView,
  RiderView,
  TrafficView,
} from "./race-view.ts";
import { cursor, HASH_WORDS, refuse } from "./snapshot-bytes.ts";
import { SNAPSHOT_FORMAT } from "./snapshot-format.ts";
import type {
  CarSetupKey,
  CrossCarSetupKey,
  PedestrianSetupKey,
  RaceSetupKey,
  RiderSetupKey,
} from "./snapshot-format.ts";
import { hashBytes } from "./snapshot-hash.ts";
import {
  bytesOf,
  flagAt,
  floatAt,
  floatsAt,
  putRecord,
  riderAt,
  riderRefAt,
  samplesAt,
  textAt,
  textOrNoneAt,
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
  | "districts"
  | "hazardsPerKilometre"
  | "id"
  | "laneWidth"
  | "name"
  | "region"
  | "seed"
  | "trafficPerKilometre";

const districtSchema = writtenSchemaOf<District>({
  from: floatAt("from"),
  lanesEachWay: floatAt("lanesEachWay"),
  shoulderWidth: floatAt("shoulderWidth"),
  vergeWidth: floatAt("vergeWidth"),
});

const planSchema = writtenSchemaOf<Pick<TrackPlan, PlanKey>>({
  districts: writtenListAt("districts", districtSchema),
  hazardsPerKilometre: floatAt("hazardsPerKilometre"),
  id: textAt("id"),
  laneWidth: floatAt("laneWidth"),
  name: textAt("name"),
  region: textAt("region"),
  seed: floatAt("seed"),
  trafficPerKilometre: floatAt("trafficPerKilometre"),
});

const propSchema = writtenSchemaOf<TrackProp>({
  kind: textAt("kind"),
  radius: floatAt("radius"),
  s: floatAt("s"),
  scale: floatAt("scale"),
  x: floatAt("x"),
});

const stallSchema = writtenSchemaOf<StallFootprint>({
  halfLength: floatAt("halfLength"),
  halfWidth: floatAt("halfWidth"),
  id: textAt("id"),
  s: floatAt("s"),
  variant: textAt("variant"),
  x: floatAt("x"),
});

const lightsSchema = writtenSchemaOf<Lights>({
  offsetTicks: floatAt("offsetTicks"),
});

const crossRoadSchema = writtenSchemaOf<CrossRoad>({
  arms: textAt("arms"),
  carsPerMinute: floatAt("carsPerMinute"),
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
  id: textAt("id"),
  kind: textAt("kind"),
  rarity: floatAt("rarity"),
  s: floatAt("s"),
  setting: textAt("setting"),
  x: floatAt("x"),
});

const walkSiteSchema = writtenSchemaOf<WalkSite>({
  crossing: floatAt("crossing"),
  id: textAt("id"),
  kind: textAt("kind"),
  s: floatAt("s"),
});

const trackSchema: WrittenSchema<Track> = writtenSchemaOf<Track>({
  carrierStarts: samplesAt("carrierStarts"),
  crossings: writtenListAt("crossings", crossingSchema),
  curvature: samplesAt("curvature"),
  endS: floatAt("endS"),
  hazards: writtenListAt("hazards", placementSchema),
  heading: samplesAt("heading"),
  length: floatAt("length"),
  oncomingLanes: samplesAt("oncomingLanes"),
  openLanes: samplesAt("openLanes"),
  plan: writtenRecordAt("plan", planSchema),
  props: writtenListAt("props", propSchema),
  roadHalfWidth: samplesAt("roadHalfWidth"),
  sameWayLanes: samplesAt("sameWayLanes"),
  sampleCount: floatAt("sampleCount"),
  slope: samplesAt("slope"),
  slopeRate: samplesAt("slopeRate"),
  solidProps: writtenListAt("solidProps", propSchema),
  stalls: writtenListAt("stalls", stallSchema),
  startS: floatAt("startS"),
  trafficReach: samplesAt("trafficReach"),
  vergeHalfWidth: samplesAt("vergeHalfWidth"),
  walkSites: writtenListAt("walkSites", walkSiteSchema),
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
  loseRange: floatAt("loseRange"),
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
  carrier: flagAt("carrier"),
  cruiseSpeed: floatAt("cruiseSpeed"),
  halfLength: floatAt("halfLength"),
  halfWidth: floatAt("halfWidth"),
  height: floatAt("height"),
  home: floatAt("home"),
  paint: floatAt("paint"),
  patience: floatAt("patience"),
});

const crossCarSetupSchema = writtenSchemaOf<
  Pick<CrossCarView, CrossCarSetupKey>
>({
  across: floatAt("across"),
  along: floatAt("along"),
  bodyHalfLength: floatAt("bodyHalfLength"),
  bodyHalfWidth: floatAt("bodyHalfWidth"),
  cruise: floatAt("cruise"),
  endAt: floatAt("endAt"),
  everyTicks: floatAt("everyTicks"),
  fromX: floatAt("fromX"),
  height: floatAt("height"),
  junction: floatAt("junction"),
  laneS: floatAt("laneS"),
  paint: floatAt("paint"),
  stopAt: floatAt("stopAt"),
  turnAt: floatAt("turnAt"),
});

const pedestrianSetupSchema = writtenSchemaOf<
  Pick<PedestrianView, PedestrianSetupKey>
>({
  command: textOrNoneAt("command"),
  crossing: floatAt("crossing"),
  halfLength: floatAt("halfLength"),
  halfWidth: floatAt("halfWidth"),
  height: floatAt("height"),
  id: textAt("id"),
  kind: textAt("kind"),
  s: floatAt("s"),
  walkKind: textAt("walkKind"),
});

type SetupListKey = "cars" | "crossCars" | "pedestrians" | "riders";

const raceSetupSchema = writtenSchemaOf<
  Pick<RaceView, RaceSetupKey | SetupListKey>
>({
  cars: writtenListAt("cars", carSetupSchema),
  crossCars: writtenListAt("crossCars", crossCarSetupSchema),
  hitDamage: floatAt("hitDamage"),
  pacing: writtenRecordAt("pacing", pacingSchema),
  pedestrians: writtenListAt("pedestrians", pedestrianSetupSchema),
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

const digestOf = <Source>(
  schema: WrittenSchema<Source>,
  source: Source
): Uint32Array => {
  const bytes = new DataView(new ArrayBuffer(bytesOf(schema, source)));
  cursor.byte = 0;
  putRecord(bytes, schema, source);
  if (cursor.byte !== bytes.byteLength) {
    refuse(
      `The setup digest wrote ${cursor.byte} of ${bytes.byteLength} bytes.`
    );
  }
  const digest = new Uint32Array(HASH_WORDS);
  hashBytes(bytes, 0, bytes.byteLength, digest);
  return digest;
};

export const setupDigest = (state: RaceView, track: Track): Uint32Array =>
  digestOf(setupSchema, { format: SNAPSHOT_FORMAT, race: state, track });

export const trackDigest = (track: Track): Uint32Array =>
  digestOf(trackSchema, track);
