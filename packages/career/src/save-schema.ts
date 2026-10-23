import { bikeIds } from "@racer/sim/bikes";
import * as Schema from "effect/Schema";

import { LastResultSchema } from "./save-result-schema.ts";
import {
  Aggression,
  Balance,
  Bike,
  Count,
  Ending,
  Envelope,
  Hits,
  Kilometres,
  Level,
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
import { BOARD_NOTES, byRacer, byRival, SAVE_VERSION } from "./state.ts";
import { byLevel, FIELD_SIZE, RIVALS_PER_RACE } from "./tables.ts";

type SaveErrorKind = "notJson" | "wrongVersion" | "invalid" | "inconsistent";

export interface SaveError {
  readonly kind: SaveErrorKind;
  readonly field: string;
}

const ActiveRace = Schema.Struct({
  bikeId: Bike,
  level: Level,
  raceId: RaceNumber,
  roadId: Road,
  seed: Seed,
  started: Schema.Literals([true]),
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
  lastAhead: Schema.Record(Racer, Schema.optionalKey(Count)),
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
  level: Level,
  memory: Schema.Struct(byRival(() => RivalMemory)),
  qualified: Schema.Struct(
    byLevel(() => Schema.Record(Road, Schema.optionalKey(QualifiedPlace)))
  ),
  record: CareerRecord,
  season: Schema.Struct(byRacer(() => SeasonEntry)),
  seed: Seed,
  story: Story,
  version: Schema.Literal(SAVE_VERSION),
  weapon: Weapon,
  weaponHits: Hits,
});

const sourceList = (longest: number) =>
  Schema.Array(Schema.Unknown).check(Schema.isMaxLength(longest));

const sourceKeys = (keys: typeof Road | typeof Racer) =>
  Schema.Record(Schema.String, Schema.Unknown).check(
    Schema.isPropertyNames(keys)
  );

export const SaveSourceSchema = Schema.Struct({
  board: sourceList(BOARD_NOTES),
  garage: sourceList(bikeIds.length),
  lastResult: Schema.NullOr(
    Schema.Struct({
      ledger: Schema.Struct({
        levelUp: Schema.NullOr(
          Schema.Struct({ bikes: sourceList(bikeIds.length) })
        ),
      }),
      summary: Schema.Struct({
        incidents: sourceList(RIVALS_PER_RACE),
        rows: sourceList(FIELD_SIZE),
      }),
    })
  ),
  qualified: Schema.Struct(byLevel(() => sourceKeys(Road))),
  season: Schema.Struct(
    byRacer(() => Schema.Struct({ lastAhead: sourceKeys(Racer) }))
  ),
});
