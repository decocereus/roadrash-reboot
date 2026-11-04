import type { RoadId } from "@racer/career/tables";
import { ordinaryRiders } from "@racer/content/riders";
import { byId } from "@racer/content/rows";
import { isCelebrity } from "@racer/sim/cast";
import type { OfficerId, OrdinaryRivalId, RivalId } from "@racer/sim/cast";

import { artUrl } from "./art.ts";

export const plates = {
  badge: artUrl("clubhouse/badge.webp"),
  counter: artUrl("clubhouse/bar/counter.webp"),
  dusk: artUrl("clubhouse/bar/dusk.webp"),
  night: artUrl("clubhouse/bar/night.webp"),
  noteCyan: artUrl("clubhouse/note-cyan.webp"),
  noteMagenta: artUrl("clubhouse/note-magenta.webp"),
  rays: artUrl("clubhouse/bar/rays.webp"),
  speech: artUrl("clubhouse/speech.webp"),
  standings: artUrl("clubhouse/standings.webp"),
  stool: artUrl("clubhouse/bar/stool.webp"),
  wall: artUrl("clubhouse/wall.webp"),
} as const;

const figures: Readonly<Record<OrdinaryRivalId, string>> = byId(
  ordinaryRiders,
  ({ art }) => artUrl(art.figure)
);

export const figureOf = (rival: RivalId): string | null =>
  isCelebrity(rival) ? null : figures[rival];

export const officerFigures = {
  "dolores-pike": artUrl("clubhouse/officers/dolores-pike.webp"),
  "wendell-haverty": artUrl("clubhouse/officers/wendell-haverty.webp"),
} as const satisfies Record<OfficerId, string>;

export const backRoomPlates = {
  backdrop: artUrl("clubhouse/back-room/backdrop.webp"),
} as const;

export const gameOverPlates = {
  backdrop: artUrl("clubhouse/game-over/backdrop.webp"),
} as const;

export const garagePlates = {
  backdrop: artUrl("clubhouse/garage/backdrop.webp"),
  mechanic: artUrl("clubhouse/garage/mechanic.webp"),
} as const;

export const bills: Readonly<Record<OrdinaryRivalId, string>> = byId(
  ordinaryRiders,
  ({ art }) => artUrl(art.bill)
);

export const stickers: readonly string[] = [
  artUrl("clubhouse/stickers/stencil-m.webp"),
  artUrl("clubhouse/stickers/antler-wing.webp"),
  artUrl("clubhouse/stickers/chequered-tyre.webp"),
  artUrl("clubhouse/stickers/club-m.webp"),
  artUrl("clubhouse/stickers/crossed-crown.webp"),
  artUrl("clubhouse/stickers/skull-helmet.webp"),
];

export const flyers = {
  "breakwater-run": artUrl("clubhouse/flyers/breakwater-run.webp"),
  "ridge-road": artUrl("clubhouse/flyers/ridge-road.webp"),
  "slag-row": artUrl("clubhouse/flyers/slag-row.webp"),
} as const satisfies Record<RoadId, string>;
