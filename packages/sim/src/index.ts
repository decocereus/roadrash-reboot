/**
 * Shared arcade rules for the browser and the authoritative race room.
 *
 * This deliberately models road-relative movement rather than rigid-body
 * physics. The state is plain data and stepRace is pure, so a room can send
 * snapshots directly and a browser can predict with the same rules.
 */

export const SIMULATION_HZ = 30;
export const SIMULATION_DT = 1 / SIMULATION_HZ;
export const MAX_RIDERS = 4;
export const LANE_COUNT = 3;
export const DEFAULT_TRACK_LENGTH = 600;
export const DEFAULT_RACE_DURATION_SECONDS = 60;

export type RacePhase = "racing" | "finished" | "aborted";
export type RiderKind = "human" | "bot";
export type RiderStatus = "active" | "crashed" | "finished";
export type TrafficKind = "vehicle" | "obstacle";
export type Lane = -1 | 0 | 1;

export type RiderInput = Readonly<{
  /** -1 is left and 1 is right. Values between them allow a gamepad stick. */
  steer: number;
  /** A value from 0 to 1. */
  throttle: number;
  /** A value from 0 to 1. Braking wins over throttle. */
  brake: number;
  /** Held or edge-triggered by the client; the server applies cooldown rules. */
  attack: boolean;
}>;

export const NEUTRAL_INPUT: RiderInput = Object.freeze({
  steer: 0,
  throttle: 0,
  brake: 0,
  attack: false,
});

export type RiderSpec = Readonly<{
  id: string;
  name: string;
  kind?: RiderKind;
  lane?: Lane;
}>;

export type TrafficSpawn = Readonly<{
  id: string;
  kind: TrafficKind;
  lane: Lane;
  distance: number;
  speed?: number;
}>;

export type RaceOptions = Readonly<{
  /** Human riders. Empty or omitted creates a solo race with three bots. */
  riders?: readonly RiderSpec[];
  trackLength?: number;
  /** A bounded race keeps a room from ticking forever when a rider stalls. */
  maxDurationSeconds?: number;
  /** Seeded so a browser preview and an authoritative room can agree. */
  seed?: number;
  traffic?: readonly TrafficSpawn[];
}>;

export type RiderState = Readonly<{
  id: string;
  name: string;
  kind: RiderKind;
  lane: number;
  lateralVelocity: number;
  roadDistance: number;
  speed: number;
  health: number;
  status: RiderStatus;
  crashTicksRemaining: number;
  attackCooldownTicks: number;
  attackTicksRemaining: number;
  hitStunTicksRemaining: number;
  riderCollisionCooldownTicks: number;
  place?: number;
  lastHitBy?: string;
}>;

export type TrafficState = Readonly<{
  id: string;
  kind: TrafficKind;
  lane: Lane;
  distance: number;
  speed: number;
  collisionCooldownTicks: number;
}>;

export type RaceEvent =
  | Readonly<{
      kind: "attack";
      attackerId: string;
      targetId?: string;
    }>
  | Readonly<{
      kind: "hit";
      attackerId: string;
      targetId: string;
      damage: number;
    }>
  | Readonly<{
      kind: "traffic-collision";
      riderId: string;
      trafficId: string;
    }>
  | Readonly<{
      kind: "rider-collision";
      riderId: string;
      otherRiderId: string;
    }>
  | Readonly<{
      kind: "crash";
      riderId: string;
      cause: "attack" | "traffic" | "rider-collision";
    }>
  | Readonly<{
      kind: "recover";
      riderId: string;
    }>
  | Readonly<{
      kind: "finish";
      riderId: string;
      place: number;
    }>;

/**
 * Serializable authoritative snapshot. Keep this as data only: no Maps,
 * Sets, class instances, timers, or functions belong in the room protocol.
 */
export type RaceState = Readonly<{
  phase: RacePhase;
  tick: number;
  elapsedSeconds: number;
  trackLength: number;
  maxDurationSeconds: number;
  finishCount: number;
  seed: number;
  riders: readonly RiderState[];
  traffic: readonly TrafficState[];
  events: readonly RaceEvent[];
}>;

export type InputsByRider = Readonly<Record<string, RiderInput | undefined>>;

const MAX_SPEED = 48;
const CRUISE_SPEED = 18;
const ACCELERATION = 7.5;
const BRAKE_DECELERATION = 14;
const DRAG = 1.5;
const LANE_EDGE = 1.12;
const LANE_SPEED = 1.5;
const STEERING_RESPONSE = 7;
const HARD_TRAFFIC_IMPACT_SPEED = 7;
const HARD_RIDER_IMPACT_SPEED = 9;
const CONTACT_SPEED = 1;
const ATTACK_COOLDOWN_TICKS = 15;
const ATTACK_DURATION_TICKS = 5;
const ATTACK_RANGE = 3.4;
const ATTACK_LANE_RANGE = 0.72;
const ATTACK_DAMAGE = 24;
const HIT_STUN_TICKS = 8;
const CRASH_TICKS = 24;
const TRAFFIC_COLLISION_DISTANCE = 1.45;
const TRAFFIC_COLLISION_LANE_RANGE = 0.58;
const RIDER_COLLISION_DISTANCE = 1.15;
const RIDER_COLLISION_LANE_RANGE = 0.5;

const clamp = (value: number, minimum: number, maximum: number): number =>
  Math.min(maximum, Math.max(minimum, value));

const clampInput = (input: RiderInput | undefined): RiderInput => ({
  steer: clamp(input?.steer ?? 0, -1, 1),
  throttle: clamp(input?.throttle ?? 0, 0, 1),
  brake: clamp(input?.brake ?? 0, 0, 1),
  attack: input?.attack === true,
});

const laneForIndex = (index: number): Lane => {
  const lane = (index % LANE_COUNT) - 1;
  if (lane === -1 || lane === 0 || lane === 1) return lane;
  return 0;
};

const seededRandom = (seed: number): (() => number) => {
  let value = seed >>> 0 || 0x9e3779b9;
  return () => {
    value = Math.imul(value ^ (value >>> 15), value | 1);
    value ^= value + Math.imul(value ^ (value >>> 7), value | 61);
    return ((value ^ (value >>> 14)) >>> 0) / 4_294_967_296;
  };
};

const defaultTraffic = (seed: number, trackLength: number): readonly TrafficState[] => {
  const random = seededRandom(seed);
  const traffic: TrafficState[] = [];
  const count = Math.max(8, Math.floor(trackLength / 105));
  for (let index = 0; index < count; index += 1) {
    const kind = random() > 0.78 ? "obstacle" : "vehicle";
    traffic.push({
      id: `traffic-${index + 1}`,
      kind,
      lane: laneForIndex(Math.floor(random() * LANE_COUNT)),
      distance: 55 + (index * (trackLength - 75)) / count + random() * 22,
      speed: kind === "vehicle" ? 10 + random() * 13 : 0,
      collisionCooldownTicks: 0,
    });
  }
  return traffic;
};

const toTrafficState = (spawn: TrafficSpawn): TrafficState => ({
  id: spawn.id,
  kind: spawn.kind,
  lane: spawn.lane,
  distance: Math.max(0, spawn.distance),
  speed: clamp(spawn.speed ?? (spawn.kind === "vehicle" ? CRUISE_SPEED : 0), 0, MAX_SPEED),
  collisionCooldownTicks: 0,
});

const makeRider = (spec: RiderSpec, index: number): RiderState => ({
  id: spec.id,
  name: spec.name,
  kind: spec.kind ?? "human",
  lane: spec.lane ?? laneForIndex(index),
  lateralVelocity: 0,
  // Keep the grid compact while giving each rider a safe longitudinal slot.
  // Three lanes are not enough to put four bikes side by side at the line.
  roadDistance: -index * 2.2,
  speed: 0,
  health: 100,
  status: "active",
  crashTicksRemaining: 0,
  attackCooldownTicks: 0,
  attackTicksRemaining: 0,
  hitStunTicksRemaining: 0,
  riderCollisionCooldownTicks: 0,
});

const botSpec = (index: number, occupiedIds: ReadonlySet<string>): RiderSpec => {
  let suffix = index + 1;
  let id = `bot-${suffix}`;
  while (occupiedIds.has(id)) {
    suffix += 1;
    id = `bot-${suffix}`;
  }
  return {
    id,
    name: `Rival ${suffix}`,
    kind: "bot",
    lane: laneForIndex(index),
  };
};

export const createRace = (options: RaceOptions = {}): RaceState => {
  const trackLength = clamp(options.trackLength ?? DEFAULT_TRACK_LENGTH, 100, 100_000);
  const maxDurationSeconds = clamp(
    options.maxDurationSeconds ?? DEFAULT_RACE_DURATION_SECONDS,
    1,
    900,
  );
  const seed = (options.seed ?? 0x5eed1234) >>> 0;
  const supplied = [
    ...(options.riders ?? [{ id: "player", name: "Player", kind: "human" as const }]),
  ].slice(0, MAX_RIDERS);
  const riders: RiderSpec[] = supplied.map((spec, index) => ({
    ...spec,
    id: spec.id.trim(),
    name: spec.name.trim() || `Rider ${index + 1}`,
  }));
  const ids = new Set<string>();
  for (const rider of riders) {
    if (!rider.id || ids.has(rider.id)) {
      throw new Error("Rider ids must be non-empty and unique");
    }
    ids.add(rider.id);
  }
  for (let index = riders.length; index < MAX_RIDERS; index += 1) {
    const bot = botSpec(index, ids);
    riders.push(bot);
    ids.add(bot.id);
  }

  const traffic = options.traffic
    ? options.traffic.map(toTrafficState)
    : defaultTraffic(seed, trackLength);

  return {
    phase: "racing",
    tick: 0,
    elapsedSeconds: 0,
    trackLength,
    maxDurationSeconds,
    finishCount: 0,
    seed,
    riders: riders.map(makeRider),
    traffic,
    events: [],
  };
};

const nearestRiderAhead = (state: RaceState, rider: RiderState): RiderState | undefined => {
  let nearest: RiderState | undefined;
  let nearestDistance = Number.POSITIVE_INFINITY;
  for (const candidate of state.riders) {
    if (candidate.id === rider.id || candidate.status !== "active") continue;
    const distance = candidate.roadDistance - rider.roadDistance;
    if (distance >= 0 && distance < nearestDistance) {
      nearest = candidate;
      nearestDistance = distance;
    }
  }
  return nearest;
};

const nearestTrafficAhead = (state: RaceState, rider: RiderState): TrafficState | undefined => {
  let nearest: TrafficState | undefined;
  let nearestDistance = Number.POSITIVE_INFINITY;
  for (const traffic of state.traffic) {
    const distance = traffic.distance - rider.roadDistance;
    if (distance >= 0 && distance < nearestDistance) {
      nearest = traffic;
      nearestDistance = distance;
    }
  }
  return nearest;
};

/** Returns deterministic input for a bot slot. Human input always wins. */
export const botInput = (state: RaceState, rider: RiderState): RiderInput => {
  const traffic = nearestTrafficAhead(state, rider);
  const opponent = nearestRiderAhead(state, rider);
  const avoidDirection = (blockedLane: number): -1 | 1 =>
    rider.lane < -0.7 ? 1 : rider.lane > 0.7 ? -1 : rider.lane <= blockedLane ? -1 : 1;
  let steer = 0;
  if (
    traffic &&
    traffic.distance - rider.roadDistance < 12 &&
    Math.abs(rider.lane - traffic.lane) < 0.55
  ) {
    steer = avoidDirection(traffic.lane);
  } else if (
    opponent &&
    opponent.roadDistance - rider.roadDistance < 12 &&
    Math.abs(rider.lane - opponent.lane) < 0.7
  ) {
    steer = avoidDirection(opponent.lane);
  }
  const attack = Boolean(
    state.elapsedSeconds > 2 &&
    opponent &&
    opponent.roadDistance - rider.roadDistance <= ATTACK_RANGE + 0.25 &&
    Math.abs(rider.lane - opponent.lane) <= ATTACK_LANE_RANGE,
  );
  return {
    steer,
    throttle: 1,
    brake: traffic && traffic.distance - rider.roadDistance < 3 ? 0.35 : 0,
    attack,
  };
};

const crashRider = (
  rider: RiderState,
  cause: "attack" | "traffic" | "rider-collision",
  events: RaceEvent[],
): RiderState => {
  events.push({ kind: "crash", riderId: rider.id, cause });
  return {
    ...rider,
    status: "crashed",
    speed: Math.min(rider.speed, 8),
    lateralVelocity: 0,
    health: Math.max(1, rider.health),
    crashTicksRemaining: CRASH_TICKS,
    attackTicksRemaining: 0,
    hitStunTicksRemaining: 0,
  };
};

const advanceCrashed = (rider: RiderState, events: RaceEvent[]): RiderState => {
  const remaining = rider.crashTicksRemaining - 1;
  if (remaining > 0) {
    return {
      ...rider,
      roadDistance: rider.roadDistance,
      speed: Math.max(0, rider.speed - 2),
      crashTicksRemaining: remaining,
    };
  }
  events.push({ kind: "recover", riderId: rider.id });
  return {
    ...rider,
    status: "active",
    speed: Math.max(12, rider.speed),
    health: Math.max(45, rider.health),
    crashTicksRemaining: 0,
  };
};

const updateRider = (rider: RiderState, input: RiderInput, events: RaceEvent[]): RiderState => {
  if (rider.status === "finished") return rider;
  if (rider.status === "crashed") return advanceCrashed(rider, events);

  const attackCooldownTicks = Math.max(0, rider.attackCooldownTicks - 1);
  const attackTicksRemaining = Math.max(0, rider.attackTicksRemaining - 1);
  const hitStunTicksRemaining = Math.max(0, rider.hitStunTicksRemaining - 1);
  const riderCollisionCooldownTicks = Math.max(0, rider.riderCollisionCooldownTicks - 1);
  const steer = hitStunTicksRemaining > 0 ? 0 : input.steer;
  const throttle = hitStunTicksRemaining > 0 ? 0 : input.throttle;
  const brake = hitStunTicksRemaining > 0 ? 0.5 : input.brake;
  const acceleration =
    throttle * ACCELERATION - brake * BRAKE_DECELERATION - (throttle === 0 ? DRAG : 0);
  const speed = clamp(rider.speed + acceleration * SIMULATION_DT, 0, MAX_SPEED);
  const steeringSpeed = Math.min(1, speed / 12);
  const desiredLateralVelocity = steer * LANE_SPEED * steeringSpeed;
  const lateralVelocity =
    rider.lateralVelocity +
    (desiredLateralVelocity - rider.lateralVelocity) * STEERING_RESPONSE * SIMULATION_DT;
  const lane = clamp(rider.lane + lateralVelocity * SIMULATION_DT, -LANE_EDGE, LANE_EDGE);
  return {
    ...rider,
    lane,
    lateralVelocity:
      (lane === -LANE_EDGE && lateralVelocity < 0) || (lane === LANE_EDGE && lateralVelocity > 0)
        ? 0
        : lateralVelocity,
    roadDistance: rider.roadDistance + speed * SIMULATION_DT,
    speed,
    attackCooldownTicks,
    attackTicksRemaining,
    hitStunTicksRemaining,
    riderCollisionCooldownTicks,
  };
};

const applyAttacks = (
  riders: RiderState[],
  inputs: readonly RiderInput[],
  events: RaceEvent[],
): RiderState[] => {
  const updated = [...riders];
  for (let index = 0; index < updated.length; index += 1) {
    const attacker = updated[index];
    const input = inputs[index];
    if (
      !attacker ||
      !input ||
      attacker.status !== "active" ||
      !input.attack ||
      attacker.attackCooldownTicks > 0
    )
      continue;
    updated[index] = {
      ...attacker,
      attackCooldownTicks: ATTACK_COOLDOWN_TICKS,
      attackTicksRemaining: ATTACK_DURATION_TICKS,
    };
    let targetIndex = -1;
    let targetGap = Number.POSITIVE_INFINITY;
    for (let candidateIndex = 0; candidateIndex < updated.length; candidateIndex += 1) {
      const candidate = updated[candidateIndex];
      if (!candidate || candidate.id === attacker.id || candidate.status !== "active") continue;
      const gap = candidate.roadDistance - attacker.roadDistance;
      if (
        gap >= -0.4 &&
        gap <= ATTACK_RANGE &&
        Math.abs(candidate.lane - attacker.lane) <= ATTACK_LANE_RANGE &&
        gap < targetGap
      ) {
        targetIndex = candidateIndex;
        targetGap = gap;
      }
    }
    const target = targetIndex >= 0 ? updated[targetIndex] : undefined;
    events.push(
      target
        ? { kind: "attack", attackerId: attacker.id, targetId: target.id }
        : { kind: "attack", attackerId: attacker.id },
    );
    if (!target || targetIndex < 0) continue;
    const health = Math.max(0, target.health - ATTACK_DAMAGE);
    const hitTarget: RiderState = {
      ...target,
      health,
      speed: Math.max(0, target.speed - 12),
      hitStunTicksRemaining: HIT_STUN_TICKS,
      lastHitBy: attacker.id,
    };
    events.push({
      kind: "hit",
      attackerId: attacker.id,
      targetId: target.id,
      damage: ATTACK_DAMAGE,
    });
    updated[targetIndex] = health <= 0 ? crashRider(hitTarget, "attack", events) : hitTarget;
  }
  return updated;
};

type TrafficCollisionResult = Readonly<{
  riders: readonly RiderState[];
  traffic: readonly TrafficState[];
}>;

const applyTrafficCollisions = (
  riders: RiderState[],
  traffic: readonly TrafficState[],
  events: RaceEvent[],
): TrafficCollisionResult => {
  const updated = [...riders];
  const updatedTraffic = [...traffic];
  for (let riderIndex = 0; riderIndex < updated.length; riderIndex += 1) {
    const rider = updated[riderIndex];
    if (!rider || rider.status !== "active") continue;
    for (let trafficIndex = 0; trafficIndex < updatedTraffic.length; trafficIndex += 1) {
      const obstacle = updatedTraffic[trafficIndex];
      if (!obstacle) continue;
      if (obstacle.collisionCooldownTicks > 0) continue;
      if (
        Math.abs(rider.roadDistance - obstacle.distance) > TRAFFIC_COLLISION_DISTANCE ||
        Math.abs(rider.lane - obstacle.lane) > TRAFFIC_COLLISION_LANE_RANGE
      )
        continue;
      const impactSpeed = Math.abs(rider.speed - obstacle.speed);
      if (impactSpeed < CONTACT_SPEED) continue;
      events.push({ kind: "traffic-collision", riderId: rider.id, trafficId: obstacle.id });
      updated[riderIndex] =
        impactSpeed >= HARD_TRAFFIC_IMPACT_SPEED
          ? crashRider(
              { ...rider, health: rider.health - 35, speed: rider.speed * 0.25 },
              "traffic",
              events,
            )
          : {
              ...rider,
              speed: Math.max(0, rider.speed - impactSpeed * 0.5),
              health: Math.max(1, rider.health - Math.ceil(impactSpeed * 2)),
              lateralVelocity: 0,
            };
      updatedTraffic[trafficIndex] = {
        ...obstacle,
        collisionCooldownTicks: impactSpeed >= HARD_TRAFFIC_IMPACT_SPEED ? CRASH_TICKS + 2 : 10,
      };
      break;
    }
  }
  return { riders: updated, traffic: updatedTraffic };
};

const applyRiderCollisions = (
  previousRiders: readonly RiderState[],
  riders: RiderState[],
  events: RaceEvent[],
): RiderState[] => {
  const updated = [...riders];
  for (let leftIndex = 0; leftIndex < updated.length; leftIndex += 1) {
    const left = updated[leftIndex];
    if (!left || left.status !== "active") continue;
    for (let rightIndex = leftIndex + 1; rightIndex < updated.length; rightIndex += 1) {
      const right = updated[rightIndex];
      if (!right || right.status !== "active") continue;
      if (left.riderCollisionCooldownTicks > 0 || right.riderCollisionCooldownTicks > 0) continue;
      if (
        Math.abs(left.roadDistance - right.roadDistance) > RIDER_COLLISION_DISTANCE ||
        Math.abs(left.lane - right.lane) > RIDER_COLLISION_LANE_RANGE
      )
        continue;
      const previousLeft = previousRiders[leftIndex];
      const previousRight = previousRiders[rightIndex];
      if (!previousLeft || !previousRight) continue;
      const rearIndex =
        previousLeft.roadDistance <= previousRight.roadDistance ? leftIndex : rightIndex;
      const frontIndex = rearIndex === leftIndex ? rightIndex : leftIndex;
      const rear = updated[rearIndex];
      const front = updated[frontIndex];
      if (!rear || !front) continue;
      const closingSpeed = Math.max(0, rear.speed - front.speed);
      const lateralImpact = Math.abs(left.lateralVelocity - right.lateralVelocity) * 4;
      const impactSpeed = Math.max(closingSpeed, lateralImpact);
      if (impactSpeed < CONTACT_SPEED) continue;
      const [impactIndex, otherIndex] =
        closingSpeed >= lateralImpact
          ? [rearIndex, frontIndex]
          : Math.abs(left.lateralVelocity) >= Math.abs(right.lateralVelocity)
            ? [leftIndex, rightIndex]
            : [rightIndex, leftIndex];
      const impactor = updated[impactIndex];
      const other = updated[otherIndex];
      if (!impactor || !other) continue;
      events.push({ kind: "rider-collision", riderId: impactor.id, otherRiderId: other.id });
      if (impactSpeed >= HARD_RIDER_IMPACT_SPEED) {
        updated[impactIndex] = crashRider(
          { ...impactor, health: impactor.health - 18, speed: impactor.speed * 0.3 },
          "rider-collision",
          events,
        );
        updated[otherIndex] = {
          ...other,
          health: Math.max(1, other.health - 8),
          speed: Math.max(0, other.speed - 5),
          riderCollisionCooldownTicks: 10,
        };
      } else {
        updated[impactIndex] = {
          ...impactor,
          health: Math.max(1, impactor.health - 4),
          speed: Math.max(0, impactor.speed - 2),
          lateralVelocity: 0,
          riderCollisionCooldownTicks: 10,
        };
        updated[otherIndex] = {
          ...other,
          speed: Math.max(0, other.speed - 1),
          lateralVelocity: 0,
          riderCollisionCooldownTicks: 10,
        };
      }
      break;
    }
  }
  return updated;
};

const applyFinishes = (
  riders: RiderState[],
  state: RaceState,
  events: RaceEvent[],
): RiderState[] => {
  let finishCount = state.finishCount;
  const previousById = new Map(state.riders.map((rider) => [rider.id, rider]));
  const candidates = riders
    .map((rider, index) => {
      if (rider.status !== "active" || rider.roadDistance < state.trackLength) return undefined;
      const previous = previousById.get(rider.id);
      const distanceDelta = rider.roadDistance - (previous?.roadDistance ?? rider.roadDistance);
      const crossingFraction =
        distanceDelta > 0
          ? clamp(
              (state.trackLength - (previous?.roadDistance ?? state.trackLength)) / distanceDelta,
              0,
              1,
            )
          : 1;
      return { index, crossingFraction, riderId: rider.id };
    })
    .filter(
      (candidate): candidate is { index: number; crossingFraction: number; riderId: string } =>
        candidate !== undefined,
    )
    .sort(
      (left, right) =>
        left.crossingFraction - right.crossingFraction || left.riderId.localeCompare(right.riderId),
    );
  const finished = [...riders];
  for (const candidate of candidates) {
    const rider = finished[candidate.index];
    if (!rider) continue;
    finishCount += 1;
    finished[candidate.index] = {
      ...rider,
      status: "finished",
      roadDistance: state.trackLength,
      speed: 0,
      place: finishCount,
    };
    events.push({ kind: "finish", riderId: rider.id, place: finishCount });
  }
  return finished;
};

const assignDeadlinePlaces = (
  riders: readonly RiderState[],
  events: RaceEvent[],
): readonly RiderState[] => {
  const finished = riders.filter((rider) => rider.status === "finished").length;
  let nextPlace = finished;
  const remaining = riders
    .map((rider, index) => ({ rider, index }))
    .filter(({ rider }) => rider.status !== "finished")
    .sort(
      (left, right) =>
        right.rider.roadDistance - left.rider.roadDistance ||
        left.rider.id.localeCompare(right.rider.id),
    );
  const result = [...riders];
  for (const { rider, index } of remaining) {
    nextPlace += 1;
    result[index] = { ...rider, status: "finished", speed: 0, place: nextPlace };
    events.push({ kind: "finish", riderId: rider.id, place: nextPlace });
  }
  return result;
};

const nextTraffic = (traffic: readonly TrafficState[]): readonly TrafficState[] =>
  traffic.map((item) => ({
    ...item,
    distance: item.distance + item.speed * SIMULATION_DT,
    collisionCooldownTicks: Math.max(0, item.collisionCooldownTicks - 1),
  }));

/**
 * Advance exactly one 1/30 second simulation step. Missing human inputs are
 * neutral; bot riders are filled automatically, making solo play usable.
 */
export const stepRace = (state: RaceState, suppliedInputs: InputsByRider = {}): RaceState => {
  if (state.phase !== "racing") return { ...state, events: [] };
  const events: RaceEvent[] = [];
  const inputs = state.riders.map((rider) => {
    const supplied = suppliedInputs[rider.id];
    return clampInput(supplied ?? (rider.kind === "bot" ? botInput(state, rider) : NEUTRAL_INPUT));
  });
  const moved = state.riders.map((rider, index) =>
    updateRider(rider, inputs[index] ?? NEUTRAL_INPUT, events),
  );
  const attacked = applyAttacks(moved, inputs, events);
  const traffic = nextTraffic(state.traffic);
  const trafficResult = applyTrafficCollisions(attacked, traffic, events);
  const withRiderCollisions = applyRiderCollisions(state.riders, [...trafficResult.riders], events);
  const finished = applyFinishes(withRiderCollisions, state, events);
  const crossingFinishCount = finished.filter((rider) => rider.status === "finished").length;
  const nextTick = state.tick + 1;
  const reachedDeadline = nextTick >= Math.ceil(state.maxDurationSeconds * SIMULATION_HZ);
  const deadlineFinished =
    reachedDeadline && crossingFinishCount < finished.length
      ? assignDeadlinePlaces(finished, events)
      : finished;
  const finishCount = deadlineFinished.filter((rider) => rider.status === "finished").length;
  return {
    ...state,
    phase: finishCount === deadlineFinished.length ? "finished" : "racing",
    tick: nextTick,
    elapsedSeconds: nextTick * SIMULATION_DT,
    finishCount,
    riders: deadlineFinished,
    traffic: trafficResult.traffic,
    events,
  };
};

export const inputFor = (input: Partial<RiderInput> = {}): RiderInput =>
  clampInput({
    ...NEUTRAL_INPUT,
    ...input,
  });

export const isRaceComplete = (state: RaceState): boolean =>
  state.phase === "finished" || state.phase === "aborted";
