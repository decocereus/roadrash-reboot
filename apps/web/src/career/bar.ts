import { roadBoss, roadsFor } from "@racer/career/field";
import { tauntFrom } from "@racer/career/lines";
import type { RivalLine } from "@racer/career/lines";
import type { CareerState } from "@racer/career/state";
import { FINALE_ROAD } from "@racer/career/tables";
import type { RoadId } from "@racer/career/tables";
import { cast } from "@racer/sim/cast";
import type { RivalId } from "@racer/sim/cast";

import {
  bills,
  figures,
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

export const openRoads = (career: CareerState): readonly RoadId[] =>
  roadsFor(career)
    .roads.filter((status) => status.open)
    .map((status) => status.road.id);

export const firstRoad = (career: CareerState): RoadId =>
  roadsFor(career).next ?? openRoads(career)[0] ?? FINALE_ROAD;

const billRider = (career: CareerState, boss: RivalId): RivalId => {
  const others = cast.filter((rival) => rival.id !== boss);
  return others[career.record.starts % others.length]?.id ?? boss;
};

export const barCast = (career: CareerState, roadId: RoadId): BarCast => {
  const boss = roadBoss(career, roadId);
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

export const barPlates = (bar: BarCast): readonly string[] => [
  ...scenery,
  figures[bar.boss],
  flyers[bar.roadId],
  bar.bill,
  bar.sticker,
];

export const roadPlates = (career: CareerState): readonly string[] =>
  openRoads(career).flatMap((roadId) => [
    flyers[roadId],
    figures[roadBoss(career, roadId)],
  ]);

const decoded = async (url: string): Promise<void> => {
  const image = new Image();
  image.src = url;
  await image.decode();
};

export const preload = async (urls: readonly string[]): Promise<void> => {
  await Promise.allSettled(urls.map(decoded));
};
