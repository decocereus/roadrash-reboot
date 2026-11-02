import { roadBoss, roadsFor } from "@racer/career/field";
import { tauntFrom } from "@racer/career/lines";
import type { RivalLine } from "@racer/career/lines";
import type { RaceRules } from "@racer/career/rules";
import type { CareerState } from "@racer/career/state";
import { FINALE_ROAD } from "@racer/career/tables";
import type { RoadId } from "@racer/career/tables";
import { ordinaryRivalIds } from "@racer/sim/cast";
import type { OrdinaryRivalId, RivalId } from "@racer/sim/cast";

import {
  bills,
  figureOf,
  flyers,
  plates,
  stickers,
} from "../assets/clubhouse-art.ts";

export interface BarCast {
  readonly roadId: RoadId;
  readonly boss: RivalId;
  readonly line: RivalLine;
  readonly bill: string;
  readonly sticker: string;
}

export const openRoads = (
  rules: RaceRules,
  career: CareerState
): readonly RoadId[] =>
  roadsFor(rules, career)
    .roads.filter((status) => status.open)
    .map((status) => status.road.id);

export const firstRoad = (rules: RaceRules, career: CareerState): RoadId =>
  roadsFor(rules, career).next ?? openRoads(rules, career)[0] ?? FINALE_ROAD;

const billRider = (career: CareerState, boss: RivalId): OrdinaryRivalId => {
  const others = ordinaryRivalIds.filter((rival) => rival !== boss);
  return others[career.record.starts % others.length] ?? ordinaryRivalIds[0];
};

export const barCast = (
  rules: RaceRules,
  career: CareerState,
  roadId: RoadId
): BarCast => {
  const boss = roadBoss(rules, career, roadId);
  return {
    bill: bills[billRider(career, boss)],
    boss,
    line: tauntFrom(career, boss),
    roadId,
    sticker: stickers[career.record.starts % stickers.length] ?? plates.badge,
  };
};

const scenery = [
  plates.night,
  plates.dusk,
  plates.rays,
  plates.counter,
  plates.stool,
  plates.speech,
  plates.standings,
  plates.noteCyan,
  plates.noteMagenta,
  plates.badge,
  plates.wall,
];

const bossFigure = (boss: RivalId): readonly string[] => {
  const figure = figureOf(boss);
  return figure === null ? [] : [figure];
};

export const barPlates = (bar: BarCast): readonly string[] => [
  ...scenery,
  ...bossFigure(bar.boss),
  flyers[bar.roadId],
  bar.bill,
  bar.sticker,
];

export const roadPlates = (
  rules: RaceRules,
  career: CareerState
): readonly string[] =>
  openRoads(rules, career).flatMap((roadId) => [
    flyers[roadId],
    ...bossFigure(roadBoss(rules, career, roadId)),
  ]);

const decoded = async (url: string): Promise<void> => {
  const image = new Image();
  image.src = url;
  await image.decode();
};

export const preload = async (urls: readonly string[]): Promise<void> => {
  await Promise.allSettled(urls.map(decoded));
};
