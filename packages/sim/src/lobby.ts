import { atan, cos, hypot2, sin } from "@racer/track/math";

import {
  FURNITURE,
  routeAcrossFloor,
  settleOnFloor,
  STOOLS,
} from "./lobby-floor.ts";
import type { Spot } from "./lobby-floor.ts";
import type { LobbyPose, LobbyWalk } from "./lobby-walk.ts";

export const LOBBY_TICK = 1 / 60;

type LobbyPlace =
  | { readonly kind: "foot"; readonly pose: LobbyPose | null }
  | { readonly kind: "stool"; readonly stool: number }
  | { readonly kind: "bike" };

const STANDING: LobbyPlace = { kind: "foot", pose: null };
const RIDING: LobbyPlace = { kind: "bike" };

export interface LobbyRider extends Spot {
  place: LobbyPlace;
  bikeFound: boolean;
  heading: number;
  speed: number;
  pace: number;
  stride: number;
  lean: number;
  dirX: number;
  dirZ: number;
  target: Spot | null;
  route: Spot[];
  stopAt: number;
  stuck: number;
  shoving: number;
  pushX: number;
  pushZ: number;
}

export interface LobbyControl {
  readonly forward: number;
  readonly right: number;
  readonly sprint: boolean;
}

const SPAWN = { x: 3.4, z: 3.6 } as const;
const OTHER_RADIUS = 0.34;
const STRIDE_RUN_SPEED = 7;
const STUCK_PACE = 0.35;
const STUCK_TICKS = 27;
const STEP_OFF_STOOL = 0.75;
const SEAT_REACH = 1.3;
const SEAT_TAKEN = 0.5;
const STEP_OFF_BIKE = 1.1;
const FULL_TURN = Math.PI * 2;

const FOOT = {
  accel: 26,
  arrived: 0.2,
  jog: 4.4,
  radius: 0.36,
  sprint: 7,
  turnRate: 13,
} as const;

const BIKE = {
  accel: 7,
  arrived: 1.2,
  boost: 11,
  brake: 11,
  leanPerTurn: 0.075,
  maxLean: 0.42,
  radius: 0.8,
  roll: 7.5,
  slowest: 0.35,
  turnFast: 2.4,
  turnGain: 5,
  turnSlow: 1,
  turnSpeed: 4,
} as const;

export const LOBBY_MAX_LEAN = BIKE.maxLean;

export const SHOVE = {
  decayRate: 7,
  reach: 2.4,
  speed: 4.2,
  stop: 0.05,
  ticks: 18,
} as const;

const BAR_RIGHT_END = 0.25;
const OUT_FRONT = { maxX: -2.5, minX: -9.5, z: -1.2 } as const;
const TAPS_REACH = 1.15;
const TAPS_BEHIND = FURNITURE.taps.z - 0.4;

const headingOf = (dx: number, dz: number): number => {
  if (dz > 0) {
    return atan(dx / dz) + Math.PI;
  }
  if (dz < 0) {
    return atan(dx / dz);
  }
  return dx > 0 ? -Math.PI / 2 : Math.PI / 2;
};

export const angleOff = (from: number, to: number): number => {
  const off = (to - from + Math.PI) % FULL_TURN;
  return (off < 0 ? off + FULL_TURN : off) - Math.PI;
};

export const createLobbyRider = (): LobbyRider => ({
  bikeFound: false,
  dirX: 0,
  dirZ: -1,
  heading: 0,
  lean: 0,
  pace: 0,
  place: STANDING,
  pushX: 0,
  pushZ: 0,
  route: [],
  shoving: 0,
  speed: 0,
  stopAt: FOOT.arrived,
  stride: 0,
  stuck: 0,
  target: null,
  x: SPAWN.x,
  z: SPAWN.z,
});

const onBike = (rider: LobbyRider): boolean => rider.place.kind === "bike";

const dropRoute = (rider: LobbyRider): void => {
  rider.target = null;
  rider.route.length = 0;
};

const stopMoving = (rider: LobbyRider): void => {
  rider.speed = 0;
  rider.pace = 0;
  rider.lean = 0;
  dropRoute(rider);
};

const SPAWN_SPACING = 0.9;

export const stepAsideAtSpawn = (rider: LobbyRider, slot: number): void => {
  rider.x = SPAWN.x + slot * SPAWN_SPACING;
};

const CENTIMETRES = 100;
const toCentimetres = (metres: number): number =>
  Math.round(metres * CENTIMETRES) / CENTIMETRES;

export const walkOf = ({
  heading,
  lean,
  pace,
  place,
  x,
  z,
}: LobbyRider): LobbyWalk => ({
  heading: toCentimetres(heading),
  lean: toCentimetres(lean),
  pace: toCentimetres(pace),
  place: place.kind,
  pose: place.kind === "foot" ? place.pose : null,
  x: toCentimetres(x),
  z: toCentimetres(z),
});

export const respawnRider = (rider: LobbyRider): void => {
  rider.x = SPAWN.x;
  rider.z = SPAWN.z;
  rider.heading = 0;
  rider.place = STANDING;
  rider.shoving = 0;
  rider.pushX = 0;
  rider.pushZ = 0;
  stopMoving(rider);
};

export const sendRiderTo = (rider: LobbyRider, x: number, z: number): void => {
  rider.route = onBike(rider) ? [{ x, z }] : routeAcrossFloor(rider, { x, z });
  rider.target = rider.route.shift() ?? null;
  rider.stopAt = onBike(rider) ? BIKE.arrived : FOOT.arrived;
  rider.stuck = 0;
  if (rider.place.kind === "foot") {
    rider.place = STANDING;
  }
};

export const stoolNear = (
  rider: LobbyRider,
  taken: readonly Spot[]
): number | null => {
  let best: number | null = null;
  let nearest = SEAT_REACH;
  for (let index = 0; index < STOOLS.length; index += 1) {
    const stool = STOOLS[index];
    if (stool) {
      const away = hypot2(stool.x - rider.x, stool.z - rider.z);
      const free = taken.every(
        (other) => hypot2(other.x - stool.x, other.z - stool.z) > SEAT_TAKEN
      );
      if (away < nearest && free) {
        nearest = away;
        best = index;
      }
    }
  }
  return best;
};

export const sitOnStool = (rider: LobbyRider, index: number): void => {
  const stool = STOOLS[index];
  if (!stool) {
    return;
  }
  rider.place = { kind: "stool", stool: index };
  rider.x = stool.x;
  rider.z = stool.z;
  rider.heading = stool.heading;
  stopMoving(rider);
};

export const standUp = (rider: LobbyRider): void => {
  rider.place = STANDING;
};

export const holdPose = (rider: LobbyRider, pose: LobbyPose): void => {
  if (rider.place.kind === "foot") {
    rider.place = {
      kind: "foot",
      pose: rider.place.pose === pose ? null : pose,
    };
  }
};

export const atTheTaps = ({ x, z }: Spot): boolean =>
  z < TAPS_BEHIND &&
  hypot2(x - FURNITURE.taps.x, z - FURNITURE.taps.z) < TAPS_REACH;

export const pullTheTaps = (rider: LobbyRider): boolean => {
  if (rider.bikeFound || !atTheTaps(rider)) {
    return false;
  }
  rider.bikeFound = true;
  return true;
};

const bringBikeOutFront = (rider: LobbyRider): void => {
  if (rider.z < FURNITURE.counterZ && rider.x < BAR_RIGHT_END) {
    rider.x = Math.max(OUT_FRONT.minX, Math.min(OUT_FRONT.maxX, rider.x));
    rider.z = OUT_FRONT.z;
  }
};

export const toggleBike = (rider: LobbyRider): boolean => {
  if (!rider.bikeFound) {
    return false;
  }
  stopMoving(rider);
  if (onBike(rider)) {
    rider.place = STANDING;
    rider.x += cos(rider.heading) * STEP_OFF_BIKE;
    rider.z -= sin(rider.heading) * STEP_OFF_BIKE;
  } else {
    bringBikeOutFront(rider);
    rider.place = RIDING;
  }
  return true;
};

export const startShove = (rider: LobbyRider): boolean => {
  if (rider.shoving > 0 || rider.place.kind === "stool") {
    return false;
  }
  rider.shoving = SHOVE.ticks;
  return true;
};

export const shoveRider = (
  rider: Spot & { pushX: number; pushZ: number },
  fromX: number,
  fromZ: number
): void => {
  const dx = rider.x - fromX;
  const dz = rider.z - fromZ;
  const away = hypot2(dx, dz);
  rider.pushX = away === 0 ? SHOVE.speed : (dx / away) * SHOVE.speed;
  rider.pushZ = away === 0 ? 0 : (dz / away) * SHOVE.speed;
};

export const carryPush = (
  rider: Spot & { pushX: number; pushZ: number },
  radius: number,
  others: readonly Spot[]
): void => {
  if (rider.pushX === 0 && rider.pushZ === 0) {
    return;
  }
  rider.x += rider.pushX * LOBBY_TICK;
  rider.z += rider.pushZ * LOBBY_TICK;
  settleOnFloor(rider, radius, others, OTHER_RADIUS);
  const fade = 1 - SHOVE.decayRate * LOBBY_TICK;
  rider.pushX = Math.abs(rider.pushX) < SHOVE.stop ? 0 : rider.pushX * fade;
  rider.pushZ = Math.abs(rider.pushZ) < SHOVE.stop ? 0 : rider.pushZ * fade;
};

const wish: Spot = { x: 0, z: 0 };

const readWish = (
  rider: LobbyRider,
  control: LobbyControl,
  viewYaw: number
): boolean => {
  if (control.forward !== 0 || control.right !== 0) {
    dropRoute(rider);
    const aheadX = -sin(viewYaw);
    const aheadZ = -cos(viewYaw);
    wish.x = aheadX * control.forward - aheadZ * control.right;
    wish.z = aheadZ * control.forward + aheadX * control.right;
  } else if (rider.target) {
    wish.x = rider.target.x - rider.x;
    wish.z = rider.target.z - rider.z;
    if (hypot2(wish.x, wish.z) < rider.stopAt) {
      rider.target = rider.route.shift() ?? null;
      return false;
    }
  } else {
    return false;
  }
  const size = hypot2(wish.x, wish.z);
  wish.x /= size;
  wish.z /= size;
  return true;
};

const approach = (from: number, to: number, change: number): number =>
  from + Math.max(-change, Math.min(change, to - from));

const stoppingSpeed = ({ route, target, x, z }: LobbyRider): number =>
  target && route.length === 0
    ? Math.sqrt(2 * FOOT.accel * hypot2(target.x - x, target.z - z))
    : FOOT.sprint;

const stepFoot = (
  rider: LobbyRider,
  wants: boolean,
  control: LobbyControl
): void => {
  const top = Math.min(
    control.sprint ? FOOT.sprint : FOOT.jog,
    stoppingSpeed(rider)
  );
  rider.speed = approach(rider.speed, wants ? top : 0, FOOT.accel * LOBBY_TICK);
  if (wants) {
    rider.dirX = wish.x;
    rider.dirZ = wish.z;
    rider.heading +=
      angleOff(rider.heading, headingOf(wish.x, wish.z)) *
      Math.min(1, FOOT.turnRate * LOBBY_TICK);
  }
};

const stepBike = (
  rider: LobbyRider,
  wants: boolean,
  control: LobbyControl
): void => {
  const off = wants ? angleOff(rider.heading, headingOf(wish.x, wish.z)) : 0;
  const roll = control.sprint ? BIKE.boost : BIKE.roll;
  const goal = wants ? roll * Math.max(BIKE.slowest, cos(off)) : 0;
  rider.speed = approach(
    rider.speed,
    goal,
    (goal > rider.speed ? BIKE.accel : BIKE.brake) * LOBBY_TICK
  );
  const limit =
    BIKE.turnSlow +
    (BIKE.turnFast - BIKE.turnSlow) * Math.min(1, rider.speed / BIKE.turnSpeed);
  const turning = Math.max(-limit, Math.min(limit, off * BIKE.turnGain));
  rider.heading += turning * LOBBY_TICK;
  rider.dirX = -sin(rider.heading);
  rider.dirZ = -cos(rider.heading);
  const leanGoal = Math.max(
    -BIKE.maxLean,
    Math.min(BIKE.maxLean, turning * rider.speed * BIKE.leanPerTurn)
  );
  rider.lean += (leanGoal - rider.lean) * Math.min(1, 6 * LOBBY_TICK);
};

export const stepLobbyRider = (
  rider: LobbyRider,
  control: LobbyControl,
  viewYaw: number,
  others: readonly Spot[]
): void => {
  rider.shoving = Math.max(0, rider.shoving - 1);
  const wants = readWish(rider, control, viewYaw);
  if (rider.place.kind === "stool") {
    if (!wants) {
      return;
    }
    rider.x += wish.x * STEP_OFF_STOOL;
    rider.z += wish.z * STEP_OFF_STOOL;
    rider.place = STANDING;
  }
  if (wants && rider.place.kind === "foot") {
    rider.place = STANDING;
  }
  const fromX = rider.x;
  const fromZ = rider.z;
  const riding = onBike(rider);
  if (riding) {
    stepBike(rider, wants, control);
  } else {
    stepFoot(rider, wants, control);
  }
  rider.x += rider.dirX * rider.speed * LOBBY_TICK;
  rider.z += rider.dirZ * rider.speed * LOBBY_TICK;
  const radius = riding ? BIKE.radius : FOOT.radius;
  settleOnFloor(rider, radius, others, OTHER_RADIUS);
  carryPush(rider, radius, others);
  rider.pace = hypot2(rider.x - fromX, rider.z - fromZ) / LOBBY_TICK;
  rider.speed = Math.min(rider.speed, rider.pace + FOOT.accel * LOBBY_TICK);
  rider.stride += (rider.pace / STRIDE_RUN_SPEED) * LOBBY_TICK;
  if (rider.target && rider.pace < STUCK_PACE) {
    rider.stuck += 1;
    if (rider.stuck > STUCK_TICKS) {
      dropRoute(rider);
    }
  } else {
    rider.stuck = 0;
  }
};
