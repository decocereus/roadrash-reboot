import { policeChoices, trafficChoices } from "@racer/career/room-race";
import { bikeIds } from "@racer/sim/bikes";
import { tiers } from "@racer/sim/difficulty";
import { roadIds } from "@racer/track/road";
import * as Schema from "effect/Schema";

import { RoomConfigSchema } from "./room-config.ts";

const RIDER_KINDS = ["human", "ai"] as const;

const RosterEntrySchema = Schema.Struct({
  bikeId: Schema.String,
  colour: Schema.NullOr(Schema.Number),
  kind: Schema.Literals(RIDER_KINDS),
  name: Schema.NullOr(Schema.String),
  rider: Schema.Number,
});

const Police = Schema.Literals(policeChoices);
const Road = Schema.Literals(roadIds);
const Tier = Schema.Literals(tiers);
const Traffic = Schema.Literals(trafficChoices);

export const RoomChoiceChangeSchema = Schema.Struct({
  police: Schema.optionalKey(Police),
  roadId: Schema.optionalKey(Road),
  tier: Schema.optionalKey(Tier),
  traffic: Schema.optionalKey(Traffic),
});

export const RoomRuleSchema = Schema.Struct({
  bikeId: Schema.Literals(bikeIds),
  police: Police,
  roadId: Road,
  tier: Tier,
  traffic: Traffic,
});

export const RaceManifestSchema = Schema.Struct({
  build: Schema.String,
  contentHash: Schema.Array(Schema.Number),
  loadingDeadlineMs: Schema.Number,
  protocol: Schema.Number,
  raceId: Schema.String,
  reconnect: Schema.Struct({
    holdSeconds: RoomConfigSchema.fields.seatHoldSeconds,
  }),
  roster: Schema.Array(RosterEntrySchema),
  rule: RoomRuleSchema,
  seed: Schema.Number,
  tickRate: Schema.Number,
  trackHash: Schema.Array(Schema.Number),
});

export type RaceManifest = typeof RaceManifestSchema.Type;

export const humanNames = (manifest: RaceManifest): readonly string[] =>
  manifest.roster.flatMap((entry) => (entry.name === null ? [] : [entry.name]));

export const humanColours = (manifest: RaceManifest): readonly number[] =>
  manifest.roster.flatMap((entry) =>
    entry.colour === null ? [] : [entry.colour]
  );

export const seatedCount = (manifest: RaceManifest): number =>
  manifest.roster.filter((entry) => entry.kind === "human").length;
