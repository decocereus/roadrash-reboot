import { nearestRival } from "@racer/sim/combat";
import { carThreat } from "@racer/sim/race";
import { riderOf } from "@racer/sim/state";
import type {
  CrashCause,
  RaceState,
  RiderState,
  TrafficCar,
} from "@racer/sim/state";
import { kick, weapons } from "@racer/sim/weapons";
import { openLanesAt } from "@racer/track/districts";
import type { Districts } from "@racer/track/districts";
import type { Track } from "@racer/track/track";

const CONTACT_METRES_ALONG = 1.9;
const CONTACT_METRES_ACROSS = 2.2;
const CONTACT_PASS_TICKS = 90;
const HELD_GAP = 15;
const LANE_REACH = 1.7;
const BEHIND_ALLOWANCE = 2;
const LANE_LOOKAHEAD = 60;
const THREAT_METRES = 1000;
const STUCK_GAP = 30;
const STUCK_REACH = 2.2;
const STUCK_CLOSING_SPEED = 9;
const NEVER = -1_000_000_000;

export interface RoadWindow {
  readonly from: number;
  readonly to: number;
}

export interface DistrictCounts {
  attacks: number;
  boxedTicks: number;
  combatCrashes: number;
  contactPasses: number;
  heldTicks: number;
  hits: number;
  liveTicks: number;
  passes: number;
  reachTicks: number;
  stuckTicks: number;
}

interface LaneCounts {
  liveTicks: number;
  stuckTicks: number;
}

export interface RaceCounts {
  readonly causes: Record<CrashCause, number>;
  carOverlaps: number;
  readonly districts: readonly DistrictCounts[];
  readonly lanes: Map<number, LaneCounts>;
  liveTicks: number;
  offRoadTicks: number;
  stuckTicks: number;
}

interface RiderPair {
  behind: boolean;
  nearTick: number;
  readonly one: RiderState;
  readonly other: RiderState;
}

interface CarPair {
  readonly one: TrafficCar;
  readonly other: TrafficCar;
  touchedTick: number;
}

export interface RaceTally {
  readonly carPairs: readonly CarPair[];
  readonly counts: RaceCounts;
  readonly riderPairs: readonly RiderPair[];
  readonly windows: readonly RoadWindow[];
}

export const windowsOf = (
  districts: Districts,
  roadLength: number
): readonly RoadWindow[] =>
  districts.map((district, index) => ({
    from: district.from,
    to: districts[index + 1]?.from ?? roadLength,
  }));

const noCauses = () =>
  ({
    combat: 0,
    hazard: 0,
    landing: 0,
    offTrack: 0,
    prop: 0,
    rider: 0,
    traffic: 0,
  }) satisfies Record<CrashCause, number>;

const noDistrictCounts = (): DistrictCounts => ({
  attacks: 0,
  boxedTicks: 0,
  combatCrashes: 0,
  contactPasses: 0,
  heldTicks: 0,
  hits: 0,
  liveTicks: 0,
  passes: 0,
  reachTicks: 0,
  stuckTicks: 0,
});

export const createTally = (
  race: RaceState,
  windows: readonly RoadWindow[]
): RaceTally => ({
  carPairs: race.cars.flatMap((one, at) =>
    race.cars.slice(at + 1).map((other) => ({ one, other, touchedTick: NEVER }))
  ),
  counts: {
    carOverlaps: 0,
    causes: noCauses(),
    districts: windows.map(noDistrictCounts),
    lanes: new Map(),
    liveTicks: 0,
    offRoadTicks: 0,
    stuckTicks: 0,
  },
  riderPairs: race.riders.flatMap((one) =>
    race.riders
      .filter((other) => other.id !== one.id)
      .map((other) => ({
        behind: one.s < other.s,
        nearTick: NEVER,
        one,
        other,
      }))
  ),
  windows,
});

const countsAt = (tally: RaceTally, s: number): DistrictCounts => {
  let at = 0;
  for (let index = 0; index < tally.windows.length; index += 1) {
    const window = tally.windows[index];
    if (window && window.from <= s) {
      at = index;
    }
  }
  const counts = tally.counts.districts[at];
  if (!counts) {
    throw new Error("A road test needs at least one district.");
  }
  return counts;
};

const isRacing = (rider: RiderState): boolean =>
  rider.mode === "riding" && rider.finishTick < 0;

const isStuck = (car: TrafficCar, rider: RiderState): boolean => {
  const gap = car.s - rider.s;
  return (
    car.cruiseSpeed > 0 &&
    gap > 0 &&
    gap < STUCK_GAP &&
    Math.abs(car.x - rider.x) < STUCK_REACH &&
    rider.speed < car.speed + STUCK_CLOSING_SPEED
  );
};

const stuckBehindCar = (race: RaceState, rider: RiderState): boolean =>
  race.cars.some((car) => isStuck(car, rider));

const isHeld = (race: RaceState, rider: RiderState): boolean =>
  rider.mode === "riding" &&
  race.riders.some((other) => {
    const gap = other.s - rider.s;
    return (
      other.id !== rider.id &&
      isRacing(other) &&
      gap > 0 &&
      gap < HELD_GAP &&
      Math.abs(other.x - rider.x) < LANE_REACH &&
      rider.speed < other.speed + 1
    );
  });

const laneOpen = (
  race: RaceState,
  rider: RiderState,
  lane: number
): boolean => {
  if (carThreat(race, rider, lane, THREAT_METRES)) {
    return false;
  }
  return !race.riders.some((other) => {
    const gap = other.s - rider.s;
    return (
      other.id !== rider.id &&
      isRacing(other) &&
      gap > -BEHIND_ALLOWANCE &&
      gap < HELD_GAP &&
      Math.abs(other.x - lane) < LANE_REACH
    );
  });
};

const isBoxed = (race: RaceState, track: Track, rider: RiderState): boolean => {
  const open = Math.min(
    openLanesAt(track, rider.s),
    openLanesAt(track, rider.s + LANE_LOOKAHEAD)
  );
  return ![
    ...track.sameWayLanes.slice(0, open),
    ...track.oncomingLanes.slice(0, open),
  ].some((lane) => laneOpen(race, rider, lane));
};

const inReach = (race: RaceState, rider: RiderState): boolean => {
  if (!isRacing(rider) || rider.airborne) {
    return false;
  }
  const strike = weapons[rider.weapon];
  return Boolean(
    nearestRival(race, rider, -1, strike) ??
    nearestRival(race, rider, 1, strike) ??
    nearestRival(race, rider, -1, kick) ??
    nearestRival(race, rider, 1, kick)
  );
};

const tallyEvents = (tally: RaceTally, race: RaceState): void => {
  for (const event of race.events) {
    if (
      event.kind === "attack" ||
      event.kind === "hit" ||
      event.kind === "crash"
    ) {
      const counts = countsAt(tally, riderOf(race.riders, event.rider)?.s ?? 0);
      if (event.kind === "attack") {
        counts.attacks += 1;
      } else if (event.kind === "hit") {
        counts.hits += 1;
      } else {
        tally.counts.causes[event.cause] += 1;
        counts.combatCrashes += event.cause === "combat" ? 1 : 0;
      }
    }
  }
};

const tallyPasses = (tally: RaceTally, race: RaceState): void => {
  for (const pair of tally.riderPairs) {
    const { one, other } = pair;
    const grounded =
      one.mode === "riding" &&
      other.mode === "riding" &&
      !one.airborne &&
      !other.airborne;
    if (
      grounded &&
      Math.abs(one.s - other.s) < CONTACT_METRES_ALONG &&
      Math.abs(one.x - other.x) < CONTACT_METRES_ACROSS
    ) {
      pair.nearTick = race.tick;
    }
    if (
      grounded &&
      pair.behind &&
      one.s >= other.s &&
      one.finishTick < 0 &&
      other.finishTick < 0
    ) {
      const counts = countsAt(tally, one.s);
      counts.passes += 1;
      counts.contactPasses +=
        race.tick - pair.nearTick < CONTACT_PASS_TICKS ? 1 : 0;
    }
    pair.behind = one.s < other.s;
  }
};

const carsOverlap = ({ one, other }: CarPair): boolean =>
  Math.abs(one.s - other.s) < one.halfLength + other.halfLength &&
  Math.abs(one.x - other.x) < one.halfWidth + other.halfWidth;

const tallyCarOverlaps = (tally: RaceTally, race: RaceState): void => {
  for (const pair of tally.carPairs) {
    if (carsOverlap(pair)) {
      tally.counts.carOverlaps += pair.touchedTick === race.tick - 1 ? 0 : 1;
      pair.touchedTick = race.tick;
    }
  }
};

const tallyRider = (
  tally: RaceTally,
  race: RaceState,
  track: Track,
  rider: RiderState
): void => {
  const counts = countsAt(tally, rider.s);
  const open = openLanesAt(track, rider.s);
  const lanes = tally.counts.lanes.get(open) ?? { liveTicks: 0, stuckTicks: 0 };
  tally.counts.lanes.set(open, lanes);
  counts.liveTicks += 1;
  tally.counts.liveTicks += 1;
  lanes.liveTicks += 1;
  tally.counts.offRoadTicks += rider.offRoad ? 1 : 0;
  if (stuckBehindCar(race, rider)) {
    counts.stuckTicks += 1;
    tally.counts.stuckTicks += 1;
    lanes.stuckTicks += 1;
  }
  counts.reachTicks += inReach(race, rider) ? 1 : 0;
  if (isHeld(race, rider)) {
    counts.heldTicks += 1;
    counts.boxedTicks += isBoxed(race, track, rider) ? 1 : 0;
  }
};

export const tallyTick = (
  tally: RaceTally,
  race: RaceState,
  track: Track
): void => {
  tallyEvents(tally, race);
  tallyPasses(tally, race);
  tallyCarOverlaps(tally, race);
  for (const rider of race.riders) {
    if (rider.finishTick < 0) {
      tallyRider(tally, race, track, rider);
    }
  }
};
