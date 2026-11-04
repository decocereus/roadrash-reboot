import { bikes } from "@racer/sim/bikes";
import type { BikeId } from "@racer/sim/bikes";
import { celebrityCast, ordinaryCast, rivalAt, rivals } from "@racer/sim/cast";
import type { RivalId } from "@racer/sim/cast";
import { difficulties, TOP_TIER } from "@racer/sim/difficulty";
import { defaultPlayer } from "@racer/sim/race";
import { clamp, PLAYER_RIDER } from "@racer/sim/state";
import type { RaceSetup, RivalSetup } from "@racer/sim/state";
import { createRandom } from "@racer/track/random";
import type { Random } from "@racer/track/random";
import type { Track } from "@racer/track/track";

import type { RaceRules } from "./rules.ts";
import { newCareer, nextRaceId, qualifiedCount } from "./state.ts";
import type { CareerState, RivalMemory } from "./state.ts";
import {
  ALLY,
  CHAMPION,
  CHAMPION_STAND_IN,
  FINALE_AGGRESSION,
  FINALE_ROAD,
  pacingFor,
  policeFor,
  prizeFor,
  repeatPrizeFor,
  roadList,
  roads,
} from "./tables.ts";
import type { Tier, Road, RoadId } from "./tables.ts";

const FIELD_SALT = 0xf1_e1_d0;

export interface CareerRaceSetup extends RaceSetup {
  readonly raceId: number;
  readonly roadId: RoadId;
  readonly tier: Tier;
  readonly field: readonly RivalId[];
}

const races = (rival: RivalId, tier: Tier): boolean =>
  tier >= rivals[rival].racesFrom;

const homeRiders = (
  { celebrities }: Pick<RaceRules, "celebrities">,
  roadId: RoadId,
  tier: Tier
): readonly RivalId[] =>
  [...ordinaryCast, ...(celebrities ? celebrityCast : [])]
    .filter((rival) => rival.home === roads[roadId].region)
    .map((rival) => (races(rival.id, tier) ? rival.id : CHAMPION_STAND_IN));

const shuffled = <Item>(items: readonly Item[], random: Random): Item[] => {
  const order = [...items];
  for (let last = order.length - 1; last > 0; last -= 1) {
    const pick = Math.floor(random() * (last + 1));
    const held = order[last];
    const swapped = order[pick];
    if (held !== undefined && swapped !== undefined) {
      order[last] = swapped;
      order[pick] = held;
    }
  }
  return order;
};

export const fewestRacers =
  1 +
  Math.max(
    ...roadList.map(
      (road) => homeRiders({ celebrities: true }, road.id, 1).length
    )
  );

export const fieldFor = (
  rules: RaceRules,
  roadId: RoadId,
  tier: Tier,
  seed: number
): readonly RivalId[] => {
  const random = createRandom(seed + FIELD_SALT);
  const home = homeRiders(rules, roadId, tier);
  const others = ordinaryCast
    .map((rival) => rival.id)
    .filter((rival) => races(rival, tier) && !home.includes(rival));
  const drawn = shuffled(others, random).slice(
    0,
    rules.fieldSize - 1 - home.length
  );
  return shuffled([...home, ...drawn], random);
};

export const isFinale = (roadId: RoadId, tier: Tier): boolean =>
  roadId === FINALE_ROAD && tier === TOP_TIER;

const aggressionOf = (rival: RivalId, roadId: RoadId, tier: Tier): number =>
  rival === CHAMPION && isFinale(roadId, tier)
    ? FINALE_AGGRESSION
    : rivals[rival].aggression;

const withMemory = (
  entry: RivalSetup,
  memory: RivalMemory,
  ally: boolean
): RivalSetup => {
  if (ally) {
    return { ...entry, aggressionBoost: -1, grudge: PLAYER_RIDER };
  }
  const aggressionBoost = clamp(
    memory.aggressionBonus,
    -entry.aggression,
    1 - entry.aggression
  );
  return memory.grudge
    ? { ...entry, aggressionBoost, grudge: PLAYER_RIDER }
    : { ...entry, aggressionBoost };
};

export const setupFor = (
  rules: RaceRules,
  career: CareerState,
  roadId: RoadId,
  seed: number,
  track: Track
): CareerRaceSetup => {
  const { tier } = career;
  const field = fieldFor(rules, roadId, tier, seed);
  return {
    conditions: difficulties[tier].conditions,
    field,
    gridOrder: "playerLast",
    pacing: pacingFor(tier),
    player: {
      ...defaultPlayer,
      bike: bikes[career.bikeId],
      weapon: career.weapon,
      weaponHits: career.weaponHits,
    },
    police: policeFor(tier, roads[roadId].region),
    raceId: career.activeRace?.raceId ?? nextRaceId(career),
    rivals: field.map((rival) =>
      withMemory(
        {
          ...rivalAt(rivals[rival], tier),
          aggression: aggressionOf(rival, roadId, tier),
        },
        career.memory[rival],
        rival === ALLY && career.story.deeAlly
      )
    ),
    roadId,
    seed,
    tier,
    track,
  };
};

export interface PracticeRace {
  readonly roadId: RoadId;
  readonly tier: Tier;
  readonly bikeId: BikeId;
  readonly seed: number;
}

export const practiceCareer = (
  pick: Pick<PracticeRace, "bikeId" | "tier">,
  seed: number
): CareerState => ({
  ...newCareer(seed),
  bikeId: pick.bikeId,
  garage: [pick.bikeId],
  tier: pick.tier,
});

export const practiceSetup = (
  rules: RaceRules,
  race: PracticeRace,
  track: Track
): CareerRaceSetup =>
  setupFor(
    rules,
    practiceCareer(race, race.seed),
    race.roadId,
    race.seed,
    track
  );

export interface RoadStatus {
  readonly road: Road;
  readonly lengthMetres: number;
  readonly open: boolean;
  readonly finale: boolean;
  readonly qualified: boolean;
  readonly bestPlace: number;
  readonly home: readonly RivalId[];
  readonly cops: number;
  readonly firstPrize: number;
}

export interface RoadBoard {
  readonly tier: Tier;
  readonly qualifiedCount: number;
  readonly finaleOpen: boolean;
  readonly next: RoadId | null;
  readonly roads: readonly RoadStatus[];
}

export const finaleOpen = (career: CareerState): boolean =>
  career.tier === TOP_TIER &&
  roadList.every(
    (road) =>
      road.id === FINALE_ROAD ||
      career.qualified[TOP_TIER][road.id] !== undefined
  );

export const roadOpen = (career: CareerState, roadId: RoadId): boolean =>
  !isFinale(roadId, career.tier) || finaleOpen(career);

export const roadBoss = (
  rules: RaceRules,
  career: CareerState,
  roadId: RoadId
): RivalId => {
  const { season } = career;
  const [boss] = homeRiders(rules, roadId, career.tier).toSorted(
    (left, right) =>
      season[right].wins - season[left].wins ||
      season[right].points - season[left].points ||
      rivals[right].skill - rivals[left].skill
  );
  return boss ?? CHAMPION_STAND_IN;
};

export const roadsFor = (rules: RaceRules, career: CareerState): RoadBoard => {
  const { tier } = career;
  const qualified = career.qualified[tier];
  const statuses = roadList.map((road) => ({
    bestPlace: qualified[road.id] ?? 0,
    cops: difficulties[tier].cops.count,
    finale: isFinale(road.id, tier),
    firstPrize:
      qualified[road.id] === undefined
        ? prizeFor(tier, 1)
        : repeatPrizeFor(tier, 1),
    home: homeRiders(rules, road.id, tier),
    lengthMetres: road.length,
    open: roadOpen(career, road.id),
    qualified: qualified[road.id] !== undefined,
    road,
  }));
  return {
    finaleOpen: finaleOpen(career),
    next:
      statuses.find((status) => status.open && !status.qualified)?.road.id ??
      null,
    qualifiedCount: qualifiedCount(qualified),
    roads: statuses,
    tier,
  };
};
