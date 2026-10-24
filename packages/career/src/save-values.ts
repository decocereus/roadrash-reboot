import { bikeIds } from "@racer/sim/bikes";
import { officerIds, rivalIds } from "@racer/sim/cast";
import { MOST_RACERS } from "@racer/sim/race";
import { weaponKinds } from "@racer/sim/state";
import { roadIds } from "@racer/track/road";
import * as Schema from "effect/Schema";

import { fates, raceResults, witnesses } from "./outcome.ts";
import { endingIds, envelopeFlags, racerIds } from "./state.ts";
import { levels, QUALIFYING_PLACE } from "./tables.ts";

const MAX_MONEY = 1e9;
const MAX_RACES = 1e6;
const MAX_KM = 100;
const MAX_TICKS = 1e7;
const MAX_TEXT = 300;
const METRES_PER_KM = 1000;

const whole = (minimum: number, maximum: number) =>
  Schema.Int.check(Schema.isBetween({ maximum, minimum }));

const finite = (minimum: number, maximum: number) =>
  Schema.Finite.check(Schema.isBetween({ maximum, minimum }));

export const Count = whole(0, MAX_RACES);
export const RaceNumber = whole(1, MAX_RACES);
export const Money = whole(0, MAX_MONEY);
export const Balance = whole(-MAX_MONEY, MAX_MONEY);
export const Kilometres = finite(0, MAX_KM);
export const Metres = finite(0, MAX_KM * METRES_PER_KM);
export const RaceTick = whole(0, MAX_TICKS);
export const FinishTick = whole(-1, MAX_TICKS);
export const FieldPlace = whole(1, MOST_RACERS);
export const QualifiedPlace = whole(1, QUALIFYING_PLACE);
export const QualifiedCount = whole(0, roadIds.length);
export const SeasonPoints = whole(0, MAX_RACES * MOST_RACERS);
export const Seed = finite(Number.MIN_SAFE_INTEGER, Number.MAX_SAFE_INTEGER);
export const Aggression = finite(-1, 1);
export const Hits = Schema.Int.check(Schema.isGreaterThanOrEqualTo(0));
export const Text = Schema.String.check(Schema.isMaxLength(MAX_TEXT));
export const Bike = Schema.Literals(bikeIds);
export const Road = Schema.Literals(roadIds);
export const Level = Schema.Literals(levels);
export const Racer = Schema.Literals(racerIds);
export const Rival = Schema.Literals(rivalIds);
export const Weapon = Schema.Literals(weaponKinds);
export const Envelope = Schema.Literals(envelopeFlags);
export const Ending = Schema.Literals(endingIds);
export const Result = Schema.Literals(raceResults);
export const RowFate = Schema.Literals(fates);
export const Witness = Schema.Literals(witnesses);
export const Officer = Schema.Literals(officerIds);
