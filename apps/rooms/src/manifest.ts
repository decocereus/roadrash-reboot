import { policeChoices, trafficChoices } from "@racer/career/room-race";
import { bikeIds } from "@racer/sim/bikes";
import { tiers } from "@racer/sim/difficulty";
import { roadIds } from "@racer/track/road";
import * as Schema from "effect/Schema";

const RECONNECT_POLICIES = ["none"] as const;

const RIDER_KINDS = ["human", "ai"] as const;

const RosterEntrySchema = Schema.Struct({
  bikeId: Schema.String,
  kind: Schema.Literals(RIDER_KINDS),
  name: Schema.NullOr(Schema.String),
  rider: Schema.Number,
});

export const RoomChoiceSchema = Schema.Struct({
  police: Schema.Literals(policeChoices),
  roadId: Schema.Literals(roadIds),
  tier: Schema.Literals(tiers),
  traffic: Schema.Literals(trafficChoices),
});

export const RoomRuleSchema = Schema.Struct({
  ...RoomChoiceSchema.fields,
  bikeId: Schema.Literals(bikeIds),
});

export const RaceManifestSchema = Schema.Struct({
  build: Schema.String,
  contentHash: Schema.Array(Schema.Number),
  loadingDeadlineMs: Schema.Number,
  protocol: Schema.Number,
  raceId: Schema.String,
  reconnect: Schema.Literals(RECONNECT_POLICIES),
  roster: Schema.Array(RosterEntrySchema),
  rule: RoomRuleSchema,
  seed: Schema.Number,
  tickRate: Schema.Number,
  trackHash: Schema.Array(Schema.Number),
});

export type RaceManifest = typeof RaceManifestSchema.Type;

export const humanNames = (manifest: RaceManifest): readonly string[] =>
  manifest.roster.flatMap((entry) => (entry.name === null ? [] : [entry.name]));

export const seatedCount = (manifest: RaceManifest): number =>
  manifest.roster.filter((entry) => entry.kind === "human").length;
