import type {
  CrashCause,
  HazardTag,
  RaceState,
  RiderId,
  RiderState,
} from "./state.ts";
import { clamp } from "./state.ts";
import { disarm } from "./weapons.ts";

const DAMAGE_SPEED = 200 / 3.6;
const LEAST_DAMAGE = 0.1;
const MOST_DAMAGE = 1.25;
const BLAME_TICKS = 60;

const damage = {
  combat: 28,
  hazard: 28,
  landing: 30,
  offTrack: 22,
  prop: 32,
  rider: 30,
  traffic: 34,
} as const satisfies Record<CrashCause, number>;

const blamedFor = (state: RaceState, rider: RiderState): RiderId | null =>
  state.tick - rider.lastHitTick <= BLAME_TICKS ? rider.lastHitBy : null;

const takesDamage = (rider: RiderState): boolean =>
  rider.profile.role === "racer" && rider.finishTick < 0;

export const throwRider = (
  state: RaceState,
  rider: RiderState,
  cause: CrashCause,
  bikeKeep: number,
  bodyKeep: number,
  speedAtImpact?: number,
  hazard: HazardTag | null = null
): void => {
  const impactSpeed = rider.speed;
  const struckAt = speedAtImpact ?? impactSpeed;
  if (takesDamage(rider)) {
    rider.condition = Math.max(
      0,
      rider.condition -
        damage[cause] *
          clamp(struckAt / DAMAGE_SPEED, LEAST_DAMAGE, MOST_DAMAGE)
    );
  }
  const wrecked = rider.condition <= 0;
  rider.mode = wrecked ? "wrecked" : "thrown";
  rider.weaponAtThrow = rider.weapon;
  disarm(rider);
  rider.chase = null;
  rider.parked = false;
  rider.attack = "none";
  rider.attackTicks = 0;
  rider.hitStun = 0;
  rider.tuck = 0;
  rider.tuckTicks = 0;
  rider.modeTicks = 0;
  rider.crashes += 1;
  rider.staleThrottle = true;
  rider.staleBrake = true;
  rider.staleSteer = true;
  rider.idleTicks = 0;
  rider.bodyS = rider.s;
  rider.bodyX = rider.x;
  rider.bodyAir = rider.air + 0.9;
  rider.bodySpeed = impactSpeed * bodyKeep;
  rider.bodyLateralSpeed = rider.lateralSpeed * bodyKeep;
  rider.bodyVerticalSpeed =
    2 + impactSpeed * 0.05 + Math.max(0, rider.verticalSpeed);
  rider.speed = impactSpeed * bikeKeep;
  rider.airborne = false;
  rider.airTicks = 0;
  rider.bumpedBy = -1;
  rider.verticalSpeed = 0;
  rider.wobble = 0;
  rider.slip = 0;
  rider.slipTicks = 0;
  state.events.push({
    by: blamedFor(state, rider),
    cause,
    hazard,
    kind: "crash",
    rider: rider.id,
    speed: struckAt,
  });
  if (wrecked) {
    state.events.push({ kind: "wrecked", rider: rider.id });
  }
};
