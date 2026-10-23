import type { HazardKind } from "@racer/track/hazards";
import type { Track } from "@racer/track/track";

export const TICK_RATE = 60;
export const TICK_SECONDS = 1 / TICK_RATE;
export const GRAVITY = 9.81;
export const BIKE_HALF_LENGTH = 1;
export const BIKE_HALF_WIDTH = 0.38;
const MIN_STEER_SPEED = 12;
export const WALKING_PACE = 3;
export const PLAYER_RIDER = 0;

export type BikeClass = "featherweight" | "middleweight" | "heavyweight";

export interface BikeSpec {
  readonly id: string;
  readonly name: string;
  readonly bikeClass: BikeClass;
  readonly price: number;
  readonly launchAcceleration: number;
  readonly powerPerMass: number;
  readonly gears: readonly number[];
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

export type AttackKind = "punch" | "kick" | "swing";

export type WeaponKind =
  | "none"
  | "club"
  | "chain"
  | "crowbar"
  | "baton"
  | "cue"
  | "sign";

type RiderRole = "racer" | "police";

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

type RiderMode =
  | "riding"
  | "thrown"
  | "lying"
  | "running"
  | "mounting"
  | "busted"
  | "wrecked";

export type CrashCause =
  | "traffic"
  | "prop"
  | "offTrack"
  | "landing"
  | "combat"
  | "rider"
  | "hazard";

export interface RiderState {
  readonly profile: RiderProfile;
  readonly bike: BikeSpec;
  readonly grudge: number;
  readonly aggressionBoost: number;
  mode: RiderMode;
  modeTicks: number;
  stamina: number;
  condition: number;
  lastHitBy: number;
  lastHitTick: number;
  bumpLoss: number;
  attack: AttackKind | "none";
  attackSide: number;
  attackTicks: number;
  attackCooldown: number;
  hitStun: number;
  weapon: WeaponKind;
  weaponHits: number;
  weaponAtThrow: WeaponKind;
  chase: number;
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

export type HazardEffect = "slip" | "stagger" | "bump" | "jolt";

export type RaceEvent =
  | {
      readonly kind: "crash";
      readonly rider: number;
      readonly cause: CrashCause;
      readonly speed: number;
      readonly by: number;
      readonly hazard: HazardTag | null;
    }
  | {
      readonly kind: "hazard";
      readonly rider: number;
      readonly hazard: HazardTag;
      readonly effect: HazardEffect;
      readonly speed: number;
    }
  | { readonly kind: "wrecked"; readonly rider: number }
  | {
      readonly kind: "knockedDown";
      readonly rider: number;
      readonly speed: number;
      readonly by: number;
    }
  | { readonly kind: "glance"; readonly rider: number }
  | { readonly kind: "bump"; readonly rider: number }
  | {
      readonly kind: "land";
      readonly rider: number;
      readonly impact: number;
      readonly airSeconds: number;
      readonly s: number;
      readonly x: number;
    }
  | {
      readonly kind: "nearMiss";
      readonly rider: number;
      readonly closingSpeed: number;
      readonly hazard: HazardTag | null;
    }
  | { readonly kind: "remount"; readonly rider: number }
  | {
      readonly kind: "attack";
      readonly rider: number;
      readonly attack: AttackKind;
      readonly weapon: WeaponKind;
      readonly side: number;
    }
  | {
      readonly kind: "hit";
      readonly rider: number;
      readonly target: number;
      readonly attack: AttackKind;
      readonly weapon: WeaponKind;
    }
  | {
      readonly kind: "weaponTaken";
      readonly rider: number;
      readonly target: number;
      readonly weapon: WeaponKind;
    }
  | {
      readonly kind: "weaponBroken";
      readonly rider: number;
      readonly weapon: WeaponKind;
    }
  | {
      readonly kind: "pursuit";
      readonly rider: number;
      readonly target: number;
    }
  | {
      readonly kind: "busted";
      readonly rider: number;
      readonly cop: number;
      readonly fine: number;
      readonly s: number;
      readonly x: number;
      readonly weapon: WeaponKind;
    }
  | {
      readonly kind: "riderContact";
      readonly rider: number;
      readonly other: number;
    }
  | { readonly kind: "finish"; readonly rider: number; readonly tick: number };

interface PoliceRules {
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
}

export interface RivalSetup extends RiderProfile {
  readonly bike: BikeSpec;
  readonly grudge?: number;
  readonly aggressionBoost?: number;
}

export interface PoliceSetup extends PoliceRules {
  readonly count: number;
  readonly officer: RiderProfile;
  readonly bike: BikeSpec;
}

type GridOrder = "playerLast" | "playerFirst";

export interface RaceSetup {
  readonly track: Track;
  readonly seed: number;
  readonly player: PlayerSetup;
  readonly rivals: readonly RivalSetup[];
  readonly police: PoliceSetup;
  readonly pacing: PacingRules;
  readonly gridOrder: GridOrder;
}

export interface RaceState {
  tick: number;
  dice: number;
  hazardDice: number;
  readonly police: PoliceRules;
  readonly pacing: PacingRules;
  readonly riders: RiderState[];
  readonly cars: TrafficCar[];
  readonly hazards: Hazard[];
  readonly events: RaceEvent[];
}

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
