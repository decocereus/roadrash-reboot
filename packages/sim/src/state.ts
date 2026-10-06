export const TICK_RATE = 60;
export const TICK_SECONDS = 1 / TICK_RATE;
export const GRAVITY = 9.81;
export const BIKE_HALF_LENGTH = 1;
export const BIKE_HALF_WIDTH = 0.38;
export const MIN_STEER_SPEED = 4;

export interface BikeSpec {
  readonly name: string;
  readonly launchAcceleration: number;
  readonly powerPerMass: number;
  readonly dragFactor: number;
  readonly rollingDeceleration: number;
  readonly engineBraking: number;
  readonly brakeDeceleration: number;
  readonly maxLean: number;
  readonly leanRate: number;
  readonly lowSpeedYawRate: number;
  readonly straightenRate: number;
  readonly steeringCarry: number;
}

export const streetBike: BikeSpec = {
  brakeDeceleration: 11,
  dragFactor: 1.38e-3,
  engineBraking: 1.2,
  launchAcceleration: 8.5,
  leanRate: 3.8,
  lowSpeedYawRate: 1.5,
  maxLean: 0.87,
  name: "Street 600",
  powerPerMass: 284,
  rollingDeceleration: 0.25,
  steeringCarry: 2,
  straightenRate: 4.5,
};

export interface RiderInput {
  steer: number;
  throttle: number;
  brake: number;
}

export type RiderMode = "riding" | "thrown" | "running" | "mounting";

export type CrashCause = "traffic" | "prop" | "offTrack" | "landing";

export interface RiderState {
  mode: RiderMode;
  modeTicks: number;
  s: number;
  x: number;
  speed: number;
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
  | { readonly kind: "finish"; readonly rider: number; readonly tick: number };

export interface RaceState {
  tick: number;
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

export const maxYawRate = (bike: BikeSpec, speed: number): number =>
  Math.min(
    (GRAVITY * Math.tan(bike.maxLean)) / Math.max(speed, MIN_STEER_SPEED),
    bike.lowSpeedYawRate
  );

export const headingAssist = (bike: BikeSpec, steer: number): number =>
  bike.straightenRate +
  (bike.steeringCarry - bike.straightenRate) * Math.min(1, Math.abs(steer));
