export const TICK_RATE = 60;
export const TICK_SECONDS = 1 / TICK_RATE;
export const GRAVITY = 9.81;
export const BIKE_HALF_LENGTH = 1;
export const BIKE_HALF_WIDTH = 0.38;
export const MIN_STEER_SPEED = 12;

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
  curvePush: 2,
  dragFactor: 1.38e-3,
  engineBraking: 1.2,
  lateralSpeed: 8,
  lateralSpeedPerSpeed: 0.03,
  launchAcceleration: 8.5,
  name: "Street 600",
  powerPerMass: 284,
  rollingDeceleration: 0.25,
  steerResponse: 12,
  visualLean: 0.38,
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

export const lateralSpeedLimit = (bike: BikeSpec, speed: number): number =>
  (bike.lateralSpeed + bike.lateralSpeedPerSpeed * speed) *
  clamp(speed / MIN_STEER_SPEED, 0, 1);

export const curvePushOf = (
  bike: BikeSpec,
  curvature: number,
  speed: number
): number => (curvature * speed * speed) / bike.curvePush;
