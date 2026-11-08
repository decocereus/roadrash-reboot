import { bikeIds } from "@racer/sim/bikes";
import { MOST_RACERS } from "@racer/sim/race";
import * as Schema from "effect/Schema";

import { LastResultSchema } from "./save-result-schema.ts";
import {
  Aggression,
  Balance,
  Bike,
  Count,
  Ending,
  Envelope,
  FieldPlace,
  Hits,
  Kilometres,
  Tier,
  Money,
  QualifiedPlace,
  RaceNumber,
  Racer,
  Rival,
  Road,
  SeasonPoints,
  Seed,
  Weapon,
} from "./save-values.ts";
import { BOARD_NOTES, SAVE_VERSION } from "./state.ts";
import { byTier } from "./tables.ts";

type SaveErrorKind = "notJson" | "wrongVersion" | "invalid" | "inconsistent";

export interface SaveError {
  readonly kind: SaveErrorKind;
  readonly field: string;
}

const ActiveRace = Schema.Struct({
  bikeId: Bike,
  raceId: RaceNumber,
  roadId: Road,
  seed: Seed,
  started: Schema.Literals([true]),
  tier: Tier,
});

const BoardNote = Schema.Union([
  Schema.Struct({
    kind: Schema.Literal("weaponWanted"),
    rival: Rival,
    weapon: Weapon,
  }),
  Schema.Struct({
    kind: Schema.Literal("wentDown"),
    km: Kilometres,
    rival: Rival,
    roadId: Road,
  }),
  Schema.Struct({
    kind: Schema.Literal("knockedPlayerDown"),
    km: Kilometres,
    rival: Rival,
    roadId: Road,
  }),
  Schema.Struct({
    kind: Schema.Literal("photoFinish"),
    loser: Racer,
    winner: Racer,
  }),
  Schema.Struct({
    fine: Money,
    kind: Schema.Literal("busted"),
    rival: Rival,
    roadId: Road,
  }),
  Schema.Struct({ kind: Schema.Literal("leftRace") }),
  Schema.Struct({ bikeId: Bike, kind: Schema.Literal("repossessed") }),
  Schema.Struct({ bikeId: Bike, kind: Schema.Literal("newBike") }),
]);

const RivalMemory = Schema.Struct({
  aggressionBonus: Aggression,
  beatPlayerByAWheel: Count,
  busted: Count,
  bustedNearPlayer: Count,
  grudge: Schema.Boolean,
  knockedDownByPlayer: Count,
  knockedPlayerDown: Count,
  lostToPlayerByAWheel: Count,
  outrunUntouched: Count,
  sharedRace: Count,
  tookPlayerWeapon: Count,
  weaponTakenByPlayer: Count,
});

const SeasonEntry = Schema.Struct({
  bestPlace: Schema.NullOr(FieldPlace),
  points: SeasonPoints,
  wins: Count,
});

const CareerRecord = Schema.Struct({
  busts: Count,
  earnings: Money,
  knockdowns: Count,
  podiums: Count,
  starts: Count,
  wins: Count,
  wrecks: Count,
});

const Story = Schema.Struct({
  deeAlly: Schema.Boolean,
  ending: Schema.NullOr(Ending),
  envelope: Envelope,
  envelopeClawedBack: Schema.Boolean,
  finaleUnlocked: Schema.Boolean,
  leftRace: Schema.Boolean,
});

export const EncodedSaveSchema = Schema.Struct({
  activeRace: Schema.NullOr(ActiveRace),
  bikeId: Bike,
  board: Schema.Array(BoardNote).check(Schema.isMaxLength(BOARD_NOTES)),
  cash: Balance,
  gameOver: Schema.Boolean,
  garage: Schema.Array(Bike).check(Schema.isMaxLength(bikeIds.length)),
  lastResult: Schema.NullOr(LastResultSchema),
  memory: Schema.Record(Rival, Schema.optionalKey(RivalMemory)),
  qualified: Schema.Struct(
    byTier(() => Schema.Record(Road, Schema.optionalKey(QualifiedPlace)))
  ),
  record: CareerRecord,
  season: Schema.Record(Racer, Schema.optionalKey(SeasonEntry)),
  seed: Seed,
  story: Story,
  tier: Tier,
  version: Schema.Literal(SAVE_VERSION),
  weapon: Weapon,
  weaponHits: Hits,
});

const sourceList = (longest: number) =>
  Schema.Array(Schema.Unknown).check(Schema.isMaxLength(longest));

const sourceKeys = (keys: typeof Road | typeof Racer | typeof Rival) =>
  Schema.Record(Schema.String, Schema.Unknown).check(
    Schema.isPropertyNames(keys)
  );

export const SaveSourceSchema = Schema.Struct({
  board: sourceList(BOARD_NOTES),
  garage: sourceList(bikeIds.length),
  lastResult: Schema.NullOr(
    Schema.Struct({
      ledger: Schema.Struct({
        tierUp: Schema.NullOr(
          Schema.Struct({ bikes: sourceList(bikeIds.length) })
        ),
      }),
      summary: Schema.Struct({
        incidents: sourceList(MOST_RACERS - 1),
        rows: sourceList(MOST_RACERS),
      }),
    })
  ),
  memory: sourceKeys(Rival),
  qualified: Schema.Struct(byTier(() => sourceKeys(Road))),
  season: sourceKeys(Racer),
});
