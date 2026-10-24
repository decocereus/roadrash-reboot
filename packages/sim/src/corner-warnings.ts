import { curvatureAt, slopeAt } from "@racer/track/track";
import type { ChevronRun, Track } from "@racer/track/track";

import { bikes } from "./bikes.ts";
import { CONTROL_RAMP, dragOf, stepDrive } from "./engine.ts";
import type { Drive } from "./engine.ts";
import { BRAKE_RESERVE } from "./rider-drive.ts";
import {
  clamp,
  curvePushOf,
  GRAVITY,
  lateralSpeedLimit,
  TICK_SECONDS,
} from "./state.ts";
import type { BikeSpec } from "./state.ts";

export const signedFor: readonly [BikeSpec, ...BikeSpec[]] = [
  bikes["ostra-sesta-600"],
  bikes["halden-wren-400"],
];

const REACTION_SECONDS = 0.25;
const BRAKE_BITE_SECONDS = 1 / (2 * CONTROL_RAMP);
const LEAD_SECONDS = REACTION_SECONDS + BRAKE_BITE_SECONDS;
const WARNED_DROP = 0.2;
const SEARCH_STEPS = 40;
const FASTEST = 120;

export interface BrakingZone {
  readonly start: number;
  readonly end: number;
  readonly approach: number;
  readonly slowest: number;
}

interface Limit {
  speed: number;
  bend: number;
}

interface Audit {
  readonly limits: Float64Array;
  readonly bends: Float64Array;
  readonly envelope: Float64Array;
  readonly zones: readonly BrakingZone[];
}

const holdSpeed = (bike: BikeSpec, curvature: number): number => {
  const push = Math.abs(curvature) / bike.curvePush;
  if (push === 0) {
    return Number.POSITIVE_INFINITY;
  }
  const held = bike.lateralSpeedPerSpeed;
  return (
    (held + Math.sqrt(held * held + 4 * push * bike.lateralSpeed)) / (2 * push)
  );
};

const swingOf = (track: Track, bike: BikeSpec, s: number, out: Limit): void => {
  const reach = Math.ceil(
    (FASTEST * lateralSpeedLimit(bike, FASTEST)) / bike.steerRate
  );
  const from = curvatureAt(track, s);
  const change = new Float64Array(reach + 1);
  const toward = new Float64Array(reach + 1);
  for (let ahead = 1; ahead <= reach; ahead += 1) {
    const curvature = curvatureAt(track, s + ahead);
    const step = Math.abs(curvature - from);
    const before = change[ahead - 1] ?? 0;
    change[ahead] = Math.max(before, step);
    toward[ahead] = step > before ? curvature : (toward[ahead - 1] ?? 0);
  }
  const windowAt = (speed: number): number =>
    Math.min(
      reach,
      Math.floor((speed * lateralSpeedLimit(bike, speed)) / bike.steerRate)
    );
  const follows = (speed: number): boolean =>
    ((change[windowAt(speed)] ?? 0) * speed * speed) / bike.curvePush <=
    lateralSpeedLimit(bike, speed);
  if (follows(FASTEST)) {
    out.speed = Number.POSITIVE_INFINITY;
    out.bend = 0;
    return;
  }
  let slow = 0;
  let fast = FASTEST;
  for (let step = 0; step < SEARCH_STEPS; step += 1) {
    const middle = (slow + fast) / 2;
    if (follows(middle)) {
      slow = middle;
    } else {
      fast = middle;
    }
  }
  out.speed = slow;
  out.bend = toward[windowAt(fast)] ?? 0;
};

const brakingAt = (
  track: Track,
  bike: BikeSpec,
  s: number,
  speed: number
): number => {
  const lock = clamp(
    Math.abs(curvePushOf(bike, curvatureAt(track, s), speed)) /
      Math.max(1, lateralSpeedLimit(bike, speed)),
    0,
    1
  );
  return (
    bike.brakeDeceleration * (1 - (1 - BRAKE_RESERVE) * lock) +
    dragOf(bike, speed, 0) +
    GRAVITY * slopeAt(track, s)
  );
};

const envelopeOf = (
  track: Track,
  bike: BikeSpec,
  limits: Float64Array
): Float64Array => {
  const envelope = Float64Array.from(limits);
  for (let s = envelope.length - 2; s >= 0; s -= 1) {
    const next = Math.min(envelope[s + 1] ?? 0, FASTEST);
    const braked = Math.sqrt(
      next * next + 2 * Math.max(0, brakingAt(track, bike, s, next))
    );
    envelope[s] = Math.min(envelope[s] ?? 0, braked);
  }
  return envelope;
};

const sampleAt = (values: Float64Array, s: number): number => {
  const at = clamp(Math.floor(s), 0, values.length - 2);
  const share = clamp(s - at, 0, 1);
  return (values[at] ?? 0) * (1 - share) + (values[at + 1] ?? 0) * share;
};

interface OpenZone {
  start: number;
  end: number;
  approach: number;
  slowest: number;
}

const zonesOf = (
  track: Track,
  bike: BikeSpec,
  envelope: Float64Array
): BrakingZone[] => {
  const drive: Drive = { gear: 1, revs: 0, shiftTicks: 0 };
  const zones: OpenZone[] = [];
  let open: OpenZone | undefined;
  let speed = 0;
  let s = 0;
  while (s < track.length) {
    const pull = Math.min(
      bike.launchAcceleration,
      stepDrive(bike, drive, speed, 1)
    );
    const free =
      speed +
      (pull - dragOf(bike, speed, 1) - GRAVITY * slopeAt(track, s)) *
        TICK_SECONDS;
    const next = s + speed * TICK_SECONDS;
    const held = sampleAt(envelope, next);
    if (free > held) {
      const last = zones.at(-1);
      if (!open && last && s - speed * LEAD_SECONDS <= last.end) {
        open = zones.pop();
      }
      open ??= { approach: speed, end: next, slowest: held, start: s };
      open.end = next;
      open.slowest = Math.min(open.slowest, held);
      speed = held;
    } else {
      if (open) {
        zones.push(open);
        open = undefined;
      }
      speed = free;
    }
    s = next;
  }
  if (open) {
    zones.push(open);
  }
  return zones;
};

const auditOf = (track: Track, bike: BikeSpec): Audit => {
  const metres = Math.floor(track.length) + 1;
  const limits = new Float64Array(metres);
  const bends = new Float64Array(metres);
  const swing: Limit = { bend: 0, speed: 0 };
  for (let s = 0; s < metres; s += 1) {
    const curvature = curvatureAt(track, s);
    const hold = holdSpeed(bike, curvature);
    swingOf(track, bike, s, swing);
    limits[s] = Math.min(hold, swing.speed);
    bends[s] = hold <= swing.speed ? curvature : swing.bend;
  }
  const envelope = envelopeOf(track, bike, limits);
  return { bends, envelope, limits, zones: zonesOf(track, bike, envelope) };
};

export const brakingZonesOf = (
  track: Track,
  bike: BikeSpec
): readonly BrakingZone[] => auditOf(track, bike).zones;

export const isWarned = (zone: BrakingZone): boolean =>
  zone.slowest < (1 - WARNED_DROP) * zone.approach;

const sideOf = (curvature: number): -1 | 1 => (curvature > 0 ? -1 : 1);

const sidesOf = ({ bends, envelope, limits }: Audit): Int8Array => {
  const sides = new Int8Array(limits.length);
  let side = 0;
  for (let s = limits.length - 1; s >= 0; s -= 1) {
    const bend = bends[s] ?? 0;
    if (envelope[s] === limits[s] && bend !== 0) {
      side = sideOf(bend);
    }
    sides[s] = side;
  }
  for (let s = 1; s < sides.length; s += 1) {
    if (sides[s] === 0) {
      sides[s] = sides[s - 1] ?? 0;
    }
  }
  return sides;
};

const markWarned = (audit: Audit, warned: Uint8Array): void => {
  for (const zone of audit.zones.filter(isWarned)) {
    const from = Math.max(
      0,
      Math.floor(zone.start - zone.approach * LEAD_SECONDS)
    );
    warned.fill(1, from, Math.ceil(zone.end) + 1);
  }
};

export const chevronRunsOf = (track: Track): ChevronRun[] => {
  const [streetBike, ...otherBikes] = signedFor;
  const street = auditOf(track, streetBike);
  const warned = new Uint8Array(street.limits.length);
  markWarned(street, warned);
  for (const bike of otherBikes) {
    markWarned(auditOf(track, bike), warned);
  }
  const sides = sidesOf(street);
  const runs: ChevronRun[] = [];
  let run: { from: number; to: number; side: -1 | 1 } | undefined;
  for (let s = 0; s < warned.length; s += 1) {
    const side = sides[s];
    if (warned[s] === 0 || (side !== -1 && side !== 1)) {
      run = undefined;
      continue;
    }
    if (run?.side === side) {
      run.to = s;
      continue;
    }
    run = { from: s, side, to: s };
    runs.push(run);
  }
  return runs;
};
