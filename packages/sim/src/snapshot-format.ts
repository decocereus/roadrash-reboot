import { hazardKinds } from "@racer/track/hazards";

import { CORNER_SCAN_POINTS, FORECAST_TICKS } from "./pilot-history.ts";
import {
  attackKinds,
  attackStates,
  bikeClasses,
  controllers,
  crashCauses,
  hazardEffects,
  riderModes,
  riderRoles,
  weaponKinds,
} from "./state.ts";
import type {
  BikeSpec,
  Hazard,
  HazardTag,
  PacingRules,
  PilotHistory,
  PoliceRules,
  RaceEvent,
  RaceState,
  RiderId,
  RiderInput,
  RiderProfile,
  RiderState,
  TrafficCar,
} from "./state.ts";

export const SNAPSHOT_FORMAT = 1;

export const HASH_WORDS = 4;

const WORD_BYTES = 4;
const TICK_BYTES = 8;

export const FORMAT_WORD_AT = 0;
export const LENGTH_WORD_AT = WORD_BYTES;
export const DIGEST_WORD_AT = 2 * WORD_BYTES;
export const TICK_AT = DIGEST_WORD_AT + HASH_WORDS * WORD_BYTES;

export const HEADER_BYTES = TICK_AT + TICK_BYTES;

export const FLOAT_BYTES = 8;
export const FLAG_BYTES = 1;
export const CHOICE_BYTES = 1;
export const COUNT_BYTES = 4;

interface SetupField {
  readonly kind: "setup";
}

interface HeaderField {
  readonly kind: "header";
}

interface FloatField {
  readonly kind: "float";
}

interface FlagField {
  readonly kind: "flag";
}

interface RiderRefField {
  readonly kind: "riderRef";
}

interface TextField {
  readonly kind: "text";
}

interface TextOrNoneField {
  readonly kind: "textOrNone";
}

interface FloatListField {
  readonly kind: "floatList";
}

interface FloatBlockField {
  readonly kind: "floatBlock";
  readonly length: number;
}

interface ChoiceField<Value extends string> {
  readonly kind: "choice";
  readonly values: readonly [Value, ...Value[]];
}

interface RecordField<Value> {
  readonly kind: "record";
  readonly fields: Fields<Value>;
}

interface RecordOrNoneField<Value> {
  readonly kind: "recordOrNone";
  readonly fields: Fields<Value>;
}

interface ListField<Value> {
  readonly kind: "list";
  readonly fields: Fields<Value>;
}

interface EventListField {
  readonly kind: "eventList";
}

type FieldFor<Value> =
  | SetupField
  | HeaderField
  | ([Value] extends [RiderId | null]
      ? RiderRefField
      : [Value] extends [boolean]
        ? FlagField
        : [Value] extends [number]
          ? FloatField
          : [Value] extends [string]
            ? ChoiceField<Value> | TextField
            : [Value] extends [Float64Array]
              ? FloatBlockField
              : [Value] extends [readonly number[]]
                ? FloatListField
                : [Value] extends [readonly RaceEvent[]]
                  ? EventListField
                  : [Value] extends [readonly (infer Item)[]]
                    ? ListField<Item>
                    : [Value] extends [string | null]
                      ? TextOrNoneField
                      : [null] extends [Value]
                        ? RecordOrNoneField<NonNullable<Value>>
                        : RecordField<Value>);

export type Fields<Value> = {
  readonly [Key in keyof Value]-?: FieldFor<Value[Key]>;
};

const setup: SetupField = { kind: "setup" };
const header: HeaderField = { kind: "header" };
const float: FloatField = { kind: "float" };
const flag: FlagField = { kind: "flag" };
const riderRef: RiderRefField = { kind: "riderRef" };
const text: TextField = { kind: "text" };
const textOrNone: TextOrNoneField = { kind: "textOrNone" };
const floatList: FloatListField = { kind: "floatList" };
const eventList: EventListField = { kind: "eventList" };

const choiceOf = <Value extends string>(
  values: readonly [Value, ...Value[]]
): ChoiceField<Value> => ({ kind: "choice", values });

const blockOf = (length: number): FloatBlockField => ({
  kind: "floatBlock",
  length,
});

const recordOf = <Value>(fields: Fields<Value>): RecordField<Value> => ({
  fields,
  kind: "record",
});

const recordOrNoneOf = <Value>(
  fields: Fields<Value>
): RecordOrNoneField<Value> => ({ fields, kind: "recordOrNone" });

const listOf = <Value>(fields: Fields<Value>): ListField<Value> => ({
  fields,
  kind: "list",
});

const inputFields = {
  brake: float,
  kick: flag,
  punch: flag,
  steer: float,
  throttle: float,
} satisfies Fields<RiderInput>;

export const hazardTagFields = {
  command: textOrNone,
  id: text,
  kind: choiceOf(hazardKinds),
} satisfies Fields<HazardTag>;

export const hazardFields = {
  ...hazardTagFields,
  halfLength: float,
  halfWidth: float,
  height: float,
  s: float,
  spawnTick: float,
  x: float,
} satisfies Fields<Hazard>;

export const profileFields = {
  aggression: float,
  jacket: float,
  name: text,
  paint: float,
  role: choiceOf(riderRoles),
  skill: float,
  weapon: choiceOf(weaponKinds),
} satisfies Fields<RiderProfile>;

export const bikeFields = {
  bikeClass: choiceOf(bikeClasses),
  brakeDeceleration: float,
  curvePush: float,
  dragFactor: float,
  engineBraking: float,
  gears: floatList,
  id: text,
  lateralSpeed: float,
  lateralSpeedPerSpeed: float,
  launchAcceleration: float,
  leanScrub: float,
  name: text,
  powerPerMass: float,
  price: float,
  rollingDeceleration: float,
  steerRate: float,
  visualLean: float,
} satisfies Fields<BikeSpec>;

export const policeFields = {
  beat: float,
  fine: float,
  sightRange: float,
  topSpeed: float,
} satisfies Fields<PoliceRules>;

export const pacingFields = {
  catchUp: float,
  leadEase: float,
} satisfies Fields<PacingRules>;

export const carFields = {
  cruiseSpeed: setup,
  halfLength: setup,
  halfWidth: setup,
  height: setup,
  paint: setup,
  s: float,
  speed: float,
  x: setup,
} satisfies Fields<TrafficCar>;

const pilotFields = {
  braked: blockOf(CORNER_SCAN_POINTS),
  courseLimit: blockOf(FORECAST_TICKS),
  coursePush: blockOf(FORECAST_TICKS),
  courseTravelled: blockOf(FORECAST_TICKS),
} satisfies Fields<PilotHistory>;

export const riderFields = {
  aggressionBoost: setup,
  air: float,
  airTicks: float,
  airborne: flag,
  attack: choiceOf(attackStates),
  attackCooldown: float,
  attackSide: float,
  attackTicks: float,
  bike: setup,
  bodyAir: float,
  bodyLateralSpeed: float,
  bodyS: float,
  bodySpeed: float,
  bodyVerticalSpeed: float,
  bodyX: float,
  brake: float,
  bumpLoss: float,
  bumpedBy: float,
  chase: riderRef,
  condition: float,
  controller: choiceOf(controllers),
  crashes: float,
  finishTick: float,
  gear: float,
  grudge: setup,
  hazardContacts: floatList,
  hazardMissed: flag,
  hazardSeen: float,
  heading: float,
  hitStun: float,
  id: setup,
  idleTicks: float,
  input: recordOf<RiderInput>(inputFields),
  jumpMisread: flag,
  jumpSeen: float,
  lastHitBy: riderRef,
  lastHitTick: float,
  lateralSpeed: float,
  lean: float,
  load: float,
  mode: choiceOf(riderModes),
  modeTicks: float,
  offRoad: flag,
  parked: flag,
  pilotLine: float,
  post: float,
  profile: setup,
  revs: float,
  s: float,
  shiftTicks: float,
  slip: float,
  slipFrom: float,
  slipTicks: float,
  speed: float,
  staleBrake: flag,
  staleSteer: flag,
  staleThrottle: flag,
  stamina: float,
  throttle: float,
  tuck: float,
  tuckTicks: float,
  verticalSpeed: float,
  weapon: choiceOf(weaponKinds),
  weaponAtThrow: choiceOf(weaponKinds),
  weaponHits: float,
  wobble: float,
  x: float,
} satisfies Fields<RiderState>;

export const raceFields = {
  cars: listOf<TrafficCar>(carFields),
  dice: float,
  events: eventList,
  hazardDice: float,
  hazards: listOf<Hazard>(hazardFields),
  pacing: setup,
  pilot: recordOf<PilotHistory>(pilotFields),
  police: setup,
  riders: listOf<RiderState>(riderFields),
  tick: header,
} satisfies Fields<RaceState>;

type EventOf<Kind extends RaceEvent["kind"]> = Extract<
  RaceEvent,
  { readonly kind: Kind }
>;

type EventFields = {
  readonly [Kind in RaceEvent["kind"]]: Fields<Omit<EventOf<Kind>, "kind">>;
};

export const eventFields: EventFields = {
  attack: {
    attack: choiceOf(attackKinds),
    rider: riderRef,
    side: float,
    weapon: choiceOf(weaponKinds),
  },
  bump: { rider: riderRef },
  busted: {
    cop: riderRef,
    fine: float,
    rider: riderRef,
    s: float,
    weapon: choiceOf(weaponKinds),
    x: float,
  },
  crash: {
    by: riderRef,
    cause: choiceOf(crashCauses),
    hazard: recordOrNoneOf<HazardTag>(hazardTagFields),
    rider: riderRef,
    speed: float,
  },
  finish: { rider: riderRef, tick: float },
  glance: { rider: riderRef },
  hazard: {
    effect: choiceOf(hazardEffects),
    hazard: recordOf<HazardTag>(hazardTagFields),
    rider: riderRef,
    speed: float,
  },
  hit: {
    attack: choiceOf(attackKinds),
    rider: riderRef,
    target: riderRef,
    weapon: choiceOf(weaponKinds),
  },
  knockedDown: { by: riderRef, rider: riderRef, speed: float },
  land: {
    airSeconds: float,
    impact: float,
    rider: riderRef,
    s: float,
    x: float,
  },
  nearMiss: {
    closingSpeed: float,
    hazard: recordOrNoneOf<HazardTag>(hazardTagFields),
    rider: riderRef,
  },
  pursuit: { rider: riderRef, target: riderRef },
  remount: { rider: riderRef },
  riderContact: { other: riderRef, rider: riderRef },
  weaponBroken: { rider: riderRef, weapon: choiceOf(weaponKinds) },
  weaponTaken: {
    rider: riderRef,
    target: riderRef,
    weapon: choiceOf(weaponKinds),
  },
  wrecked: { rider: riderRef },
};

export const eventTags = {
  attack: 0,
  bump: 1,
  busted: 2,
  crash: 3,
  finish: 4,
  glance: 5,
  hazard: 6,
  hit: 7,
  knockedDown: 8,
  land: 9,
  nearMiss: 10,
  pursuit: 11,
  remount: 12,
  riderContact: 13,
  weaponBroken: 14,
  weaponTaken: 15,
  wrecked: 16,
} satisfies Record<RaceEvent["kind"], number>;

type ErasedField =
  | SetupField
  | HeaderField
  | FloatField
  | FlagField
  | RiderRefField
  | TextField
  | TextOrNoneField
  | FloatListField
  | FloatBlockField
  | ChoiceField<string>
  | EventListField
  | { readonly kind: "record"; readonly fields: ErasedFields }
  | { readonly kind: "recordOrNone"; readonly fields: ErasedFields }
  | { readonly kind: "list"; readonly fields: ErasedFields };

type ErasedFields = Readonly<Record<string, ErasedField>>;

export const fixedBytesOf = (fields: ErasedFields): number => {
  let total = 0;
  for (const field of Object.values(fields)) {
    switch (field.kind) {
      case "setup":
      case "header":
      case "text":
      case "textOrNone":
      case "floatList":
      case "list":
      case "recordOrNone":
      case "eventList": {
        break;
      }
      case "float":
      case "riderRef": {
        total += FLOAT_BYTES;
        break;
      }
      case "flag": {
        total += FLAG_BYTES;
        break;
      }
      case "choice": {
        total += CHOICE_BYTES;
        break;
      }
      case "floatBlock": {
        total += field.length * FLOAT_BYTES;
        break;
      }
      case "record": {
        total += fixedBytesOf(field.fields);
        break;
      }
      default: {
        return field satisfies never;
      }
    }
  }
  return total;
};

export const eventFixedBytes = {
  attack: fixedBytesOf(eventFields.attack),
  bump: fixedBytesOf(eventFields.bump),
  busted: fixedBytesOf(eventFields.busted),
  crash: fixedBytesOf(eventFields.crash),
  finish: fixedBytesOf(eventFields.finish),
  glance: fixedBytesOf(eventFields.glance),
  hazard: fixedBytesOf(eventFields.hazard),
  hit: fixedBytesOf(eventFields.hit),
  knockedDown: fixedBytesOf(eventFields.knockedDown),
  land: fixedBytesOf(eventFields.land),
  nearMiss: fixedBytesOf(eventFields.nearMiss),
  pursuit: fixedBytesOf(eventFields.pursuit),
  remount: fixedBytesOf(eventFields.remount),
  riderContact: fixedBytesOf(eventFields.riderContact),
  weaponBroken: fixedBytesOf(eventFields.weaponBroken),
  weaponTaken: fixedBytesOf(eventFields.weaponTaken),
  wrecked: fixedBytesOf(eventFields.wrecked),
} satisfies Record<RaceEvent["kind"], number>;
