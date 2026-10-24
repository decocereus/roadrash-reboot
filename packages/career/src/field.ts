import { bikes } from "@racer/sim/bikes";
import type { BikeId } from "@racer/sim/bikes";
import { cast, rivalAt, rivals } from "@racer/sim/cast";
import type { RivalId } from "@racer/sim/cast";
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
  pacingLevels,
  policeFor,
  prizeFor,
  repeatPrizeFor,
  roadList,
  roads,
} from "./tables.ts";
import type { Level, Road, RoadId } from "./tables.ts";

const FIELD_SALT = 0xf1_e1_d0;

export interface CareerRaceSetup extends RaceSetup {
  readonly raceId: number;
  readonly roadId: RoadId;
  readonly level: Level;
  readonly field: readonly RivalId[];
}

const races = (rival: RivalId, level: Level): boolean =>
  level >= rivals[rival].racesFrom;

const homeRiders = (roadId: RoadId, level: Level): readonly RivalId[] =>
  cast
    .filter((rival) => rival.home === roads[roadId].region)
    .map((rival) => (races(rival.id, level) ? rival.id : CHAMPION_STAND_IN));

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
  1 + Math.max(...roadList.map((road) => homeRiders(road.id, 1).length));

export const fewestLevels = rivals[CHAMPION].racesFrom;

export const fieldFor = (
  rules: RaceRules,
  roadId: RoadId,
  level: Level,
  seed: number
): readonly RivalId[] => {
  const random = createRandom(seed + FIELD_SALT);
  const home = homeRiders(roadId, level);
  const others = cast
    .map((rival) => rival.id)
    .filter((rival) => races(rival, level) && !home.includes(rival));
  const drawn = shuffled(others, random).slice(
    0,
    rules.fieldSize - 1 - home.length
  );
  return shuffled([...home, ...drawn], random);
};

export const isFinale = (
  rules: RaceRules,
  roadId: RoadId,
  level: Level
): boolean => roadId === FINALE_ROAD && level === rules.levelCount;

const aggressionOf = (
  rules: RaceRules,
  rival: RivalId,
  roadId: RoadId,
  level: Level
): number =>
  rival === CHAMPION && isFinale(rules, roadId, level)
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
  const { level } = career;
  const field = fieldFor(rules, roadId, level, seed);
  return {
    field,
    gridOrder: "playerLast",
    level,
    pacing: pacingLevels[level],
    player: {
      ...defaultPlayer,
      bike: bikes[career.bikeId],
      weapon: career.weapon,
      weaponHits: career.weaponHits,
    },
    police: policeFor(rules, level, roads[roadId].region),
    raceId: career.activeRace?.raceId ?? nextRaceId(career),
    rivals: field.map((rival) =>
      withMemory(
        {
          ...rivalAt(rivals[rival], level),
          aggression: aggressionOf(rules, rival, roadId, level),
        },
        career.memory[rival],
        rival === ALLY && career.story.deeAlly
      )
    ),
    roadId,
    seed,
    track,
  };
};

export interface PracticeRace {
  readonly roadId: RoadId;
  readonly level: Level;
  readonly bikeId: BikeId;
  readonly seed: number;
}

export const practiceCareer = (
  pick: Pick<PracticeRace, "bikeId" | "level">,
  seed: number
): CareerState => ({
  ...newCareer(seed),
  bikeId: pick.bikeId,
  garage: [pick.bikeId],
  level: pick.level,
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
  readonly level: Level;
  readonly qualifiedCount: number;
  readonly finaleOpen: boolean;
  readonly next: RoadId | null;
  readonly roads: readonly RoadStatus[];
}

export const finaleOpen = (rules: RaceRules, career: CareerState): boolean =>
  career.level === rules.levelCount &&
  roadList.every(
    (road) =>
      road.id === FINALE_ROAD ||
      career.qualified[rules.levelCount][road.id] !== undefined
  );

export const roadOpen = (
  rules: RaceRules,
  career: CareerState,
  roadId: RoadId
): boolean =>
  !isFinale(rules, roadId, career.level) || finaleOpen(rules, career);

export const roadBoss = (career: CareerState, roadId: RoadId): RivalId => {
  const { season } = career;
  const [boss] = homeRiders(roadId, career.level).toSorted(
    (left, right) =>
      season[right].wins - season[left].wins ||
      season[right].points - season[left].points ||
      rivals[right].skill - rivals[left].skill
  );
  return boss ?? CHAMPION_STAND_IN;
};

export const roadsFor = (rules: RaceRules, career: CareerState): RoadBoard => {
  const { level } = career;
  const qualified = career.qualified[level];
  const statuses = roadList.map((road) => ({
    bestPlace: qualified[road.id] ?? 0,
    cops: rules.police[level],
    finale: isFinale(rules, road.id, level),
    firstPrize:
      qualified[road.id] === undefined
        ? prizeFor(level, 1)
        : repeatPrizeFor(level, 1),
    home: homeRiders(road.id, level),
    lengthMetres: road.lengths[level],
    open: roadOpen(rules, career, road.id),
    qualified: qualified[road.id] !== undefined,
    road,
  }));
  return {
    finaleOpen: finaleOpen(rules, career),
    level,
    next:
      statuses.find((status) => status.open && !status.qualified)?.road.id ??
      null,
    qualifiedCount: qualifiedCount(qualified),
    roads: statuses,
  };
};
