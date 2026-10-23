import * as Schema from "effect/Schema";

import {
  Balance,
  Bike,
  Count,
  Ending,
  FieldPlace,
  FinishTick,
  Kilometres,
  Level,
  Metres,
  Money,
  Officer,
  QualifiedCount,
  RaceNumber,
  RaceTick,
  Racer,
  Result,
  Rival,
  Road,
  RowFate,
  Text,
  Weapon,
  Witness,
} from "./save-values.ts";
import { catalogue, FIELD_SIZE, RIVALS_PER_RACE } from "./tables.ts";

const Row = Schema.Struct({
  bikeId: Bike,
  fate: RowFate,
  finishTick: FinishTick,
  metresLeft: Metres,
  name: Text,
  place: FieldPlace,
  prize: Money,
  racer: Racer,
});

const Incidents = Schema.Struct({
  beatPlayerByAWheel: Schema.Boolean,
  busted: Witness,
  bustedTick: RaceTick,
  knockdownKm: Kilometres,
  knockdownTick: RaceTick,
  knockedDownByPlayer: Count,
  knockedPlayerDown: Count,
  knockedPlayerDownKm: Kilometres,
  knockedPlayerDownTick: RaceTick,
  lostToPlayerByAWheel: Schema.Boolean,
  rival: Rival,
  tookPlayerWeapon: Weapon,
  tradedHits: Schema.Boolean,
  weaponTakenByPlayer: Weapon,
  weaponTakenTick: RaceTick,
});

const Bust = Schema.Struct({
  fine: Money,
  km: Kilometres,
  line: Text,
  officer: Officer,
  officerName: Text,
  weapon: Weapon,
});

const Wreck = Schema.Struct({ bikeId: Bike, km: Kilometres });

const Summary = Schema.Struct({
  bust: Schema.NullOr(Bust),
  incidents: Schema.Array(Incidents).check(Schema.isMaxLength(RIVALS_PER_RACE)),
  raceId: RaceNumber,
  rows: Schema.Array(Row).check(Schema.isMaxLength(FIELD_SIZE)),
  tick: RaceTick,
  wreck: Schema.NullOr(Wreck),
});

const LevelUp = Schema.Struct({
  bikes: Schema.Array(Bike).check(Schema.isMaxLength(catalogue.length)),
  level: Level,
});

const Line = Schema.Struct({ rival: Rival, text: Text });

const Repossession = Schema.Struct({ bikeId: Bike, tradeIn: Money });

const Ledger = Schema.Struct({
  cashAfter: Balance,
  cashBefore: Balance,
  ending: Schema.NullOr(Ending),
  envelope: Balance,
  fine: Money,
  gameOver: Schema.Boolean,
  level: Level,
  levelUp: Schema.NullOr(LevelUp),
  line: Schema.NullOr(Line),
  place: FieldPlace,
  prize: Money,
  qualified: Schema.Boolean,
  qualifiedCount: QualifiedCount,
  repair: Money,
  repairHalved: Schema.Boolean,
  repeat: Schema.Boolean,
  repossessed: Schema.NullOr(Repossession),
  result: Result,
  roadId: Road,
});

export const LastResultSchema = Schema.Struct({
  ledger: Ledger,
  summary: Summary,
});
