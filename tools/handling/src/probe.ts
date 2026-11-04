import { stepRace } from "@racer/sim/race";
import {
  curvePushOf,
  lateralSpeedLimit,
  PLAYER_RIDER,
  settledLean,
  TICK_RATE,
} from "@racer/sim/state";
import type { RaceState } from "@racer/sim/state";
import { roadHalfWidthAt } from "@racer/track/districts";
import { curvatureAt } from "@racer/track/track";
import type { Track } from "@racer/track/track";

import type { Bend } from "./bends.ts";
import {
  aloneRace,
  bike,
  frameFor,
  KMH,
  pilotPedals,
  playerOf,
} from "./course.ts";
import type { Pedals } from "./course.ts";

const OFF_ROAD_TICKS = TICK_RATE;
const LEAD_METRES = 60;
const CRAWL_SPEED = 30 / KMH;
const CRAWL_TICKS = 2 * TICK_RATE;
const SNAPSHOT_EVERY = 30;
const SNAPSHOTS_KEPT = 8;
const LIFT_PAST_CRASH = 40;
const HELD_LINE = 1;

type Stop = "finished" | "crashed" | "offRoad" | "stalled" | "window";

interface Sample {
  readonly s: number;
  readonly x: number;
  readonly speed: number;
  readonly push: number;
  readonly lean: number;
  readonly limit: number;
  readonly offRoad: boolean;
}

export interface Ride {
  readonly samples: readonly Sample[];
  readonly stop: Stop;
  readonly stopS: number;
  readonly cause: string | null;
}

export interface BendResult {
  readonly bend: number;
  readonly from: number;
  readonly to: number;
  readonly turnDegrees: number;
  readonly peakCurvature: number;
  readonly radius: number;
  readonly entryKmh: number;
  readonly peakPushShare: number;
  readonly needsSteer: boolean;
  readonly beyondLock: boolean;
  readonly peakAbsX: number;
  readonly peakDrift: number;
  readonly roadHalfWidth: number;
  readonly stayedOn: boolean;
  readonly heldLine: boolean;
  readonly reached: boolean;
  readonly outcome: Stop;
  readonly cause: string | null;
  readonly absorbed: number;
}

const crashCause = (state: RaceState): string | null => {
  for (const event of state.events) {
    if (event.kind === "crash" && event.rider === PLAYER_RIDER) {
      return event.cause;
    }
  }
  return null;
};

const ride = (
  state: RaceState,
  track: Track,
  pedals: Pedals,
  untilS: number,
  onRail: boolean,
  onTick?: (state: RaceState) => void
): Ride => {
  const rider = playerOf(state);
  const samples: Sample[] = [];
  let offRoadTicks = 0;
  let crawlTicks = 0;
  let moving = false;
  for (;;) {
    onTick?.(state);
    const input = pedals(state, track);
    stepRace(state, track, frameFor(input));
    if (onRail) {
      rider.x = 0;
    }
    const curvature = curvatureAt(track, rider.s);
    samples.push({
      lean: settledLean(bike, curvature, rider.speed),
      limit: lateralSpeedLimit(bike, rider.speed, input.throttle),
      offRoad: rider.offRoad,
      push: curvePushOf(bike, curvature, rider.speed),
      s: rider.s,
      speed: rider.speed,
      x: rider.x,
    });
    if (rider.mode !== "riding") {
      return {
        cause: crashCause(state),
        samples,
        stop: "crashed",
        stopS: rider.s,
      };
    }
    offRoadTicks = rider.offRoad ? offRoadTicks + 1 : 0;
    moving ||= rider.speed >= CRAWL_SPEED;
    crawlTicks = moving && rider.speed < CRAWL_SPEED ? crawlTicks + 1 : 0;
    const stop = ((): Stop | null => {
      if (offRoadTicks > OFF_ROAD_TICKS) {
        return "offRoad";
      }
      if (crawlTicks > CRAWL_TICKS) {
        return "stalled";
      }
      if (rider.finishTick >= 0) {
        return "finished";
      }
      return rider.s >= untilS ? "window" : null;
    })();
    if (stop !== null) {
      return { cause: null, samples, stop, stopS: rider.s };
    }
  }
};

const bendResult = (bend: Bend, track: Track, free: Ride): BendResult => {
  const inBend = free.samples.filter(
    (each) => each.s >= bend.from && each.s < bend.to
  );
  const watched = free.samples.filter(
    (each) => each.s >= bend.from && each.s < bend.watchTo
  );
  const [entry] = inBend;
  let pushSum = 0;
  let absorbedSum = 0;
  let peakShare = 0;
  let peakAbsX = 0;
  let peakDrift = 0;
  for (const each of inBend) {
    pushSum += Math.abs(each.push);
    absorbedSum += Math.abs(each.lean);
    peakShare = Math.max(
      peakShare,
      Math.abs(each.push) / Math.max(1, each.limit)
    );
  }
  for (const each of watched) {
    peakAbsX = Math.max(peakAbsX, Math.abs(each.x));
    peakDrift = Math.max(peakDrift, Math.abs(each.x - (entry?.x ?? 0)));
  }
  const failed =
    free.stop === "crashed" ||
    free.stop === "stalled" ||
    free.stop === "offRoad" ||
    watched.some((each) => each.offRoad);
  return {
    absorbed: pushSum > 0 ? absorbedSum / pushSum : 1,
    bend: bend.index,
    beyondLock: peakShare > 1,
    cause: free.cause,
    entryKmh: (entry?.speed ?? 0) * KMH,
    from: bend.from,
    heldLine: !failed && peakDrift <= HELD_LINE,
    needsSteer: bend.peakCurvature > 0 && absorbedSum < pushSum,
    outcome: free.stop,
    peakAbsX,
    peakCurvature: bend.peakCurvature,
    peakDrift,
    peakPushShare: peakShare,
    radius: 1 / bend.peakCurvature,
    reached: entry !== undefined,
    roadHalfWidth: roadHalfWidthAt(track, bend.from),
    stayedOn: !failed,
    to: bend.to,
    turnDegrees: bend.turnDegrees,
  };
};

interface Rail {
  state: RaceState;
  readonly samples: Sample[];
  readonly lifts: number[];
  readonly snapshots: RaceState[];
  stop: Stop;
  cause: string | null;
  liftUntil: number;
}

const railTo = (
  rail: Rail,
  track: Track,
  pedals: Pedals,
  untilS: number
): boolean => {
  const keep = (state: RaceState): void => {
    if (state.tick % SNAPSHOT_EVERY === 0) {
      rail.snapshots.push(structuredClone(state));
      if (rail.snapshots.length > SNAPSHOTS_KEPT) {
        rail.snapshots.shift();
      }
    }
  };
  for (;;) {
    const { s } = playerOf(rail.state);
    if (s >= untilS) {
      return true;
    }
    const lifting = s < rail.liftUntil;
    const leg = ride(
      rail.state,
      track,
      lifting ? pilotPedals : pedals,
      lifting ? Math.min(untilS, rail.liftUntil) : untilS,
      true,
      keep
    );
    rail.samples.push(...leg.samples);
    if (leg.stop !== "window") {
      const [back] = rail.snapshots;
      const crashS = Math.round(leg.stopS);
      if (
        leg.stop !== "crashed" ||
        leg.cause !== "landing" ||
        !back ||
        rail.lifts.includes(crashS)
      ) {
        rail.stop = leg.stop;
        rail.cause = leg.cause;
        return false;
      }
      rail.lifts.push(crashS);
      rail.state = structuredClone(back);
      rail.snapshots.length = 0;
      rail.liftUntil = leg.stopS + LIFT_PAST_CRASH;
      const backS = playerOf(rail.state).s;
      while ((rail.samples.at(-1)?.s ?? Number.NEGATIVE_INFINITY) > backS) {
        rail.samples.pop();
      }
    }
  }
};

export interface Probe {
  readonly lifts: readonly number[];
  readonly rail: Ride;
  readonly results: readonly BendResult[];
}

export const probeBends = (
  track: Track,
  bends: readonly Bend[],
  pedals: Pedals
): Probe => {
  const results: BendResult[] = [];
  const rail: Rail = {
    cause: null,
    liftUntil: Number.NEGATIVE_INFINITY,
    lifts: [],
    samples: [],
    snapshots: [],
    state: aloneRace(track),
    stop: "finished",
  };
  let railOk = true;
  let previousEnd = 0;
  for (const bend of bends) {
    const release = Math.min(
      bend.from,
      Math.max(previousEnd, bend.from - LEAD_METRES)
    );
    previousEnd = bend.to;
    railOk = railTo(rail, track, pedals, release);
    if (!railOk) {
      break;
    }
    const free = ride(
      structuredClone(rail.state),
      track,
      pedals,
      bend.watchTo,
      false
    );
    results.push(bendResult(bend, track, free));
  }
  if (railOk) {
    railTo(rail, track, pedals, Number.POSITIVE_INFINITY);
  }
  return {
    lifts: rail.lifts,
    rail: {
      cause: rail.cause,
      samples: rail.samples,
      stop: rail.stop,
      stopS: playerOf(rail.state).s,
    },
    results,
  };
};

export interface FromTheGrid {
  readonly ride: Ride;
  readonly bendsCleared: number;
  readonly failedBend: number | null;
}

export const fromTheGrid = (
  track: Track,
  bends: readonly Bend[],
  pedals: Pedals
): FromTheGrid => {
  const run = ride(
    aloneRace(track),
    track,
    pedals,
    Number.POSITIVE_INFINITY,
    false
  );
  const cleared = bends.filter(
    (bend) => bend.watchTo <= run.stopS || run.stop === "finished"
  );
  return {
    bendsCleared: cleared.length,
    failedBend:
      run.stop === "finished"
        ? null
        : (bends.find((bend) => run.stopS < bend.watchTo)?.index ?? null),
    ride: run,
  };
};

export interface Coverage {
  readonly bendMetres: number;
  readonly carriedShare: number;
  readonly beyondLockShare: number;
}

export const coverageOf = (rail: Ride, bends: readonly Bend[]): Coverage => {
  let metres = 0;
  let carried = 0;
  let beyond = 0;
  let previousS: number | null = null;
  for (const each of rail.samples) {
    if (
      previousS !== null &&
      bends.some((bend) => each.s >= bend.from && each.s < bend.to)
    ) {
      const step = each.s - previousS;
      metres += step;
      if (Math.abs(each.push) <= Math.abs(each.lean)) {
        carried += step;
      }
      if (Math.abs(each.push) > Math.max(1, each.limit)) {
        beyond += step;
      }
    }
    previousS = each.s;
  }
  return {
    bendMetres: metres,
    beyondLockShare: metres > 0 ? beyond / metres : 0,
    carriedShare: metres > 0 ? carried / metres : 0,
  };
};
