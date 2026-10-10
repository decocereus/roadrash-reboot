export const TICK_RATE = 60;
export const TICK_SECONDS = 1 / TICK_RATE;
export const GRAVITY = 9.81;
export const BIKE_HALF_LENGTH = 1;
export const BIKE_HALF_WIDTH = 0.38;
export const MIN_STEER_SPEED = 12;
export const WALKING_PACE = 3;

export interface BikeSpec {
  readonly name: string;
  readonly launchAcceleration: number;
  readonly powerPerMass: number;
  readonly dragFactor: number;
  readonly rollingDeceleration: number;
  readonly engineBraking: number;
  readonly brakeDeceleration: number;
  readonly lateralSpeed: number;
  readonly lateralSpeedPerSpeed: number;
  readonly steerResponse: number;
  readonly curvePush: number;
  readonly visualLean: number;
}

export const streetBike: BikeSpec = {
  brakeDeceleration: 11,
  curvePush: 2.1,
  dragFactor: 1.38e-3,
  engineBraking: 1.2,
  lateralSpeed: 9,
  lateralSpeedPerSpeed: 0.03,
  launchAcceleration: 8.5,
  name: "Street 600",
  powerPerMass: 284,
  rollingDeceleration: 0.25,
  steerResponse: 20,
  visualLean: 0.38,
};

export interface RiderInput {
  steer: number;
  throttle: number;
  brake: number;
  punch: boolean;
  kick: boolean;
}

export type AttackKind = "punch" | "kick" | "swing";

export type WeaponKind = "none" | "club" | "chain" | "crowbar" | "baton";

export type RiderRole = "racer" | "police";

export interface RiderProfile {
  readonly name: string;
  readonly paint: number;
  readonly aggression: number;
  readonly skill: number;
  readonly role: RiderRole;
  readonly weapon: WeaponKind;
}

export const MAX_STAMINA = 100;

export type RiderMode = "riding" | "thrown" | "running" | "mounting" | "busted";

export type CrashCause =
  | "traffic"
  | "prop"
  | "offTrack"
  | "landing"
  | "combat"
  | "rider";

export interface RiderState {
  readonly profile: RiderProfile;
  mode: RiderMode;
  modeTicks: number;
  stamina: number;
  attack: AttackKind | "none";
  attackSide: number;
  attackTicks: number;
  attackCooldown: number;
  hitStun: number;
  weapon: WeaponKind;
  weaponHits: number;
  chase: number;
  parked: boolean;
  s: number;
  x: number;
  speed: number;
  lateralSpeed: number;
  heading: number;
  lean: number;
  air: number;
  verticalSpeed: number;
  airborne: boolean;
  airTicks: number;
  offRoad: boolean;
  load: number;
  bodyS: number;
  bodyX: number;
  bodyAir: number;
  bodySpeed: number;
  bodyLateralSpeed: number;
  bodyVerticalSpeed: number;
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

export type RaceEvent =
  | {
      readonly kind: "crash";
      readonly rider: number;
      readonly cause: CrashCause;
      readonly speed: number;
    }
  | { readonly kind: "glance"; readonly rider: number }
  | { readonly kind: "bump"; readonly rider: number }
  | {
      readonly kind: "land";
      readonly rider: number;
      readonly impact: number;
      readonly airSeconds: number;
    }
  | {
      readonly kind: "nearMiss";
      readonly rider: number;
      readonly closingSpeed: number;
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
    }
  | {
      readonly kind: "riderContact";
      readonly rider: number;
      readonly other: number;
    }
  | { readonly kind: "finish"; readonly rider: number; readonly tick: number };

export interface RaceState {
  tick: number;
  dice: number;
  readonly bike: BikeSpec;
  readonly riders: RiderState[];
  readonly cars: TrafficCar[];
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
