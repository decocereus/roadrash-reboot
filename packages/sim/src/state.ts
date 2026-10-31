import type { HazardKind } from "@racer/track/hazards";
import type { Track } from "@racer/track/track";

export const TICK_RATE = 60;
export const TICK_SECONDS = 1 / TICK_RATE;
export const GRAVITY = 9.81;
export const BIKE_HALF_LENGTH = 1;
export const BIKE_HALF_WIDTH = 0.38;
const MIN_STEER_SPEED = 12;
export const WALKING_PACE = 3;
const SETTLED_LEAN = 0.4;

declare const riderIdBrand: unique symbol;

export type RiderId = number & { readonly [riderIdBrand]: true };

const isRiderId = (slot: number): slot is RiderId =>
  Number.isSafeInteger(slot) && slot >= 0;

export const riderIdAt = (slot: number): RiderId => {
  if (!isRiderId(slot)) {
    throw new RangeError(`No rider sits in slot ${slot}.`);
  }
  return slot;
};

export const PLAYER_RIDER = riderIdAt(0);

const bikeClasses = ["featherweight", "middleweight", "heavyweight"] as const;

export type BikeClass = (typeof bikeClasses)[number];

export interface BikeSpec {
  readonly id: string;
  readonly name: string;
  readonly bikeClass: BikeClass;
  readonly price: number;
  readonly launchAcceleration: number;
  readonly powerPerMass: number;
  readonly gears: readonly [number, ...number[]];
  readonly dragFactor: number;
  readonly rollingDeceleration: number;
  readonly engineBraking: number;
  readonly brakeDeceleration: number;
  readonly lateralSpeed: number;
  readonly lateralSpeedPerSpeed: number;
  readonly steerRate: number;
  readonly curvePush: number;
  readonly leanScrub: number;
  readonly visualLean: number;
}

export interface RiderInput {
  steer: number;
  throttle: number;
  brake: number;
  punch: boolean;
  kick: boolean;
}

export const controllers = ["human", "pilot"] as const;

export type Controller = (typeof controllers)[number];

declare const controlBrand: unique symbol;

export type Control = number & { readonly [controlBrand]: true };

export interface InputFrame {
  readonly handovers: ReadonlyMap<RiderId, Controller>;
  readonly controls: ReadonlyMap<RiderId, Control>;
}

export const attackKinds = ["punch", "kick", "swing"] as const;

export type AttackKind = (typeof attackKinds)[number];

export const attackStates = ["none", ...attackKinds] as const;

type AttackState = (typeof attackStates)[number];

export const weaponKinds = [
  "none",
  "club",
  "chain",
  "crowbar",
  "baton",
  "cue",
  "sign",
] as const;

export type WeaponKind = (typeof weaponKinds)[number];

const riderRoles = ["racer", "police"] as const;

type RiderRole = (typeof riderRoles)[number];

export interface RiderProfile {
  readonly name: string;
  readonly paint: number;
  readonly jacket: number;
  readonly aggression: number;
  readonly skill: number;
  readonly role: RiderRole;
  readonly weapon: WeaponKind;
}

export const MAX_STAMINA = 100;

export const FULL_CONDITION = 100;

export const riderModes = [
  "riding",
  "thrown",
  "lying",
  "running",
  "mounting",
  "busted",
  "wrecked",
] as const;

type RiderMode = (typeof riderModes)[number];

export const crashCauses = [
  "traffic",
  "prop",
  "offTrack",
  "landing",
  "combat",
  "rider",
  "hazard",
] as const;

export type CrashCause = (typeof crashCauses)[number];

export interface RiderState {
  readonly id: RiderId;
  controller: Controller;
  readonly input: RiderInput;
  readonly profile: RiderProfile;
  readonly bike: BikeSpec;
  readonly grudge: RiderId | null;
  readonly aggressionBoost: number;
  mode: RiderMode;
  modeTicks: number;
  stamina: number;
  condition: number;
  lastHitBy: RiderId | null;
  lastHitTick: number;
  bumpLoss: number;
  attack: AttackState;
  attackSide: number;
  attackTicks: number;
  attackCooldown: number;
  hitStun: number;
  weapon: WeaponKind;
  weaponHits: number;
  weaponAtThrow: WeaponKind;
  chase: RiderId | null;
  parked: boolean;
  post: number;
  s: number;
  x: number;
  speed: number;
  lateralSpeed: number;
  throttle: number;
  brake: number;
  gear: number;
  revs: number;
  shiftTicks: number;
  tuck: number;
  tuckTicks: number;
  heading: number;
  lean: number;
  air: number;
  verticalSpeed: number;
  airborne: boolean;
  airTicks: number;
  wobble: number;
  slip: number;
  slipFrom: number;
  slipTicks: number;
  hazardContacts: number[];
  bumpedBy: number;
  hazardSeen: number;
  hazardMissed: boolean;
  pilotLine: number;
  jumpSeen: number;
  jumpMisread: boolean;
  offRoad: boolean;
  load: number;
  bodyS: number;
  bodyX: number;
  bodyAir: number;
  bodySpeed: number;
  bodyLateralSpeed: number;
  bodyVerticalSpeed: number;
  staleThrottle: boolean;
  staleBrake: boolean;
  staleSteer: boolean;
  idleTicks: number;
  finishTick: number;
  crashes: number;
}

export interface TrafficCar {
  s: number;
  speed: number;
  readonly x: number;
  readonly cruiseSpeed: number;
  readonly halfLength: number;
  readonly halfWidth: number;
  readonly height: number;
  readonly paint: number;
}

export interface HazardTag {
  readonly id: string;
  readonly kind: HazardKind;
  readonly command: string | null;
}

export interface Hazard extends HazardTag {
  readonly s: number;
  readonly x: number;
  readonly halfLength: number;
  readonly halfWidth: number;
  readonly height: number;
  readonly spawnTick: number;
}

export const hazardEffects = ["slip", "stagger", "bump", "jolt"] as const;

export type HazardEffect = (typeof hazardEffects)[number];

export type RaceEvent =
  | {
      readonly kind: "crash";
      readonly rider: RiderId;
      readonly cause: CrashCause;
      readonly speed: number;
      readonly by: RiderId | null;
      readonly hazard: HazardTag | null;
    }
  | {
      readonly kind: "hazard";
      readonly rider: RiderId;
      readonly hazard: HazardTag;
      readonly effect: HazardEffect;
      readonly speed: number;
    }
  | { readonly kind: "wrecked"; readonly rider: RiderId }
  | {
      readonly kind: "knockedDown";
      readonly rider: RiderId;
      readonly speed: number;
      readonly by: RiderId | null;
    }
  | { readonly kind: "glance"; readonly rider: RiderId }
  | { readonly kind: "bump"; readonly rider: RiderId }
  | {
      readonly kind: "land";
      readonly rider: RiderId;
      readonly impact: number;
      readonly airSeconds: number;
      readonly s: number;
      readonly x: number;
    }
  | {
      readonly kind: "nearMiss";
      readonly rider: RiderId;
      readonly closingSpeed: number;
      readonly hazard: HazardTag | null;
    }
  | { readonly kind: "remount"; readonly rider: RiderId }
  | {
      readonly kind: "attack";
      readonly rider: RiderId;
      readonly attack: AttackKind;
      readonly weapon: WeaponKind;
      readonly side: number;
    }
  | {
      readonly kind: "hit";
      readonly rider: RiderId;
      readonly target: RiderId;
      readonly attack: AttackKind;
      readonly weapon: WeaponKind;
    }
  | {
      readonly kind: "weaponTaken";
      readonly rider: RiderId;
      readonly target: RiderId;
      readonly weapon: WeaponKind;
    }
  | {
      readonly kind: "weaponBroken";
      readonly rider: RiderId;
      readonly weapon: WeaponKind;
    }
  | {
      readonly kind: "pursuit";
      readonly rider: RiderId;
      readonly target: RiderId;
    }
  | {
      readonly kind: "busted";
      readonly rider: RiderId;
      readonly cop: RiderId;
      readonly fine: number;
      readonly s: number;
      readonly x: number;
      readonly weapon: WeaponKind;
    }
  | {
      readonly kind: "riderContact";
      readonly rider: RiderId;
      readonly other: RiderId;
    }
  | { readonly kind: "finish"; readonly rider: RiderId; readonly tick: number };

export interface PoliceRules {
  readonly topSpeed: number;
  readonly sightRange: number;
  readonly beat: number;
  readonly fine: number;
}

export interface PacingRules {
  readonly leadEase: number;
  readonly catchUp: number;
}

export interface PlayerSetup extends RiderProfile {
  readonly bike: BikeSpec;
  readonly weaponHits: number;
  readonly controller?: Controller;
}

export interface RivalSetup extends RiderProfile {
  readonly bike: BikeSpec;
  readonly grudge?: RiderId;
  readonly aggressionBoost?: number;
  readonly controller?: Controller;
}

export interface PoliceSetup extends PoliceRules {
  readonly count: number;
  readonly officer: RiderProfile;
  readonly bike: BikeSpec;
}

const gridOrders = ["playerLast", "playerFirst"] as const;

type GridOrder = (typeof gridOrders)[number];

export interface RaceSetup {
  readonly track: Track;
  readonly seed: number;
  readonly player: PlayerSetup;
  readonly rivals: readonly RivalSetup[];
  readonly police: PoliceSetup;
  readonly pacing: PacingRules;
  readonly gridOrder: GridOrder;
}

export interface PilotHistory {
  readonly braked: Float64Array;
  readonly courseTravelled: Float64Array;
  readonly coursePush: Float64Array;
  readonly courseLimit: Float64Array;
}

export interface RaceState {
  tick: number;
  dice: number;
  hazardDice: number;
  readonly pilot: PilotHistory;
  readonly police: PoliceRules;
  readonly pacing: PacingRules;
  readonly riders: readonly RiderState[];
  readonly cars: TrafficCar[];
  readonly hazards: Hazard[];
  readonly events: RaceEvent[];
}

export interface Roster {
  readonly player: RiderId;
  readonly rivals: readonly RiderId[];
  readonly police: readonly RiderId[];
}

export const rosterOf = (setup: RaceSetup): Roster => ({
  player: PLAYER_RIDER,
  police: Array.from({ length: setup.police.count }, (_, at) =>
    riderIdAt(1 + setup.rivals.length + at)
  ),
  rivals: setup.rivals.map((_, at) => riderIdAt(1 + at)),
});

export const riderOf = <Entry>(
  perRider: readonly Entry[],
  id: RiderId | null
): Entry | undefined => (id === null ? undefined : perRider[id]);

export const slotOf = <Slot>(
  slots: Slot[],
  index: number,
  create: () => Slot
): Slot => {
  const known = slots[index];
  if (known !== undefined) {
    return known;
  }
  const made = create();
  slots[index] = made;
  return made;
};

export const clamp = (
  value: number,
  minimum: number,
  maximum: number
): number => Math.min(maximum, Math.max(minimum, value));

export const approach = (
  value: number,
  target: number,
  step: number
): number => {
  if (value < target) {
    return Math.min(target, value + step);
  }
  return Math.max(target, value - step);
};

export const lateralSpeedLimit = (
  bike: BikeSpec,
  speed: number,
  throttle = 0
): number =>
  (bike.lateralSpeed + bike.lateralSpeedPerSpeed * speed) *
  clamp(
    (throttle > 0 ? Math.max(speed, WALKING_PACE) : speed) / MIN_STEER_SPEED,
    0,
    1
  );

export const curvePushOf = (
  bike: BikeSpec,
  curvature: number,
  speed: number
): number => (curvature * speed * speed) / bike.curvePush;

const settledLean = (push: number, limit: number): number =>
  clamp(push, -SETTLED_LEAN * limit, SETTLED_LEAN * limit);

export const lateralFor = (
  steer: number,
  push: number,
  limit: number,
  share: number
): number => {
  const lean = settledLean(push, limit);
  return lean + steer * (limit - Math.sign(steer) * lean) * share;
};

export const steerFor = (
  bike: BikeSpec,
  curvature: number,
  speed: number,
  lateralSpeed: number
): number => {
  const limit = Math.max(1, lateralSpeedLimit(bike, speed));
  const lean = settledLean(curvePushOf(bike, curvature, speed), limit);
  const swing = lateralSpeed - lean;
  return swing / (limit - Math.sign(swing) * lean);
};
