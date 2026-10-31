import type { RoadId } from "@racer/career/tables";
import type { OfficerId, RivalId } from "@racer/sim/cast";

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

export const figures = {
  "agnes-mulcahy": artUrl("clubhouse/rivals/agnes-mulcahy.webp"),
  "benny-okafor": artUrl("clubhouse/rivals/benny-okafor.webp"),
  "coach-dale-hutto": artUrl("clubhouse/rivals/coach-dale-hutto.webp"),
  "dee-santangelo": artUrl("clubhouse/rivals/dee-santangelo.webp"),
  "felix-aurand": artUrl("clubhouse/rivals/felix-aurand.webp"),
  "gus-abernathy": artUrl("clubhouse/rivals/gus-abernathy.webp"),
  "hollis-thorne": artUrl("clubhouse/rivals/hollis-thorne.webp"),
  "ines-marchetti": artUrl("clubhouse/rivals/ines-marchetti.webp"),
  "juno-kade": artUrl("clubhouse/rivals/juno-kade.webp"),
  "lyle-gorski": artUrl("clubhouse/rivals/lyle-gorski.webp"),
  "mags-dunleavy": artUrl("clubhouse/rivals/mags-dunleavy.webp"),
  "moose-kowalczyk": artUrl("clubhouse/rivals/moose-kowalczyk.webp"),
  "orrin-blackwell": artUrl("clubhouse/rivals/orrin-blackwell.webp"),
  "ruth-ann-bixby": artUrl("clubhouse/rivals/ruth-ann-bixby.webp"),
  "tristan-lux": artUrl("clubhouse/rivals/tristan-lux.webp"),
  "wanda-pruitt": artUrl("clubhouse/rivals/wanda-pruitt.webp"),
} as const satisfies Record<RivalId, string>;

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

export const bills = {
  "agnes-mulcahy": artUrl("clubhouse/bills/agnes-mulcahy.webp"),
  "benny-okafor": artUrl("clubhouse/bills/benny-okafor.webp"),
  "coach-dale-hutto": artUrl("clubhouse/bills/coach-dale-hutto.webp"),
  "dee-santangelo": artUrl("clubhouse/bills/dee-santangelo.webp"),
  "felix-aurand": artUrl("clubhouse/bills/felix-aurand.webp"),
  "gus-abernathy": artUrl("clubhouse/bills/gus-abernathy.webp"),
  "hollis-thorne": artUrl("clubhouse/bills/hollis-thorne.webp"),
  "ines-marchetti": artUrl("clubhouse/bills/ines-marchetti.webp"),
  "juno-kade": artUrl("clubhouse/bills/juno-kade.webp"),
  "lyle-gorski": artUrl("clubhouse/bills/lyle-gorski.webp"),
  "mags-dunleavy": artUrl("clubhouse/bills/mags-dunleavy.webp"),
  "moose-kowalczyk": artUrl("clubhouse/bills/smoke-fuel.webp"),
  "orrin-blackwell": artUrl("clubhouse/bills/orrin-blackwell.webp"),
  "ruth-ann-bixby": artUrl("clubhouse/bills/ruth-ann-bixby.webp"),
  "tristan-lux": artUrl("clubhouse/bills/tristan-lux.webp"),
  "wanda-pruitt": artUrl("clubhouse/bills/wanda-pruitt.webp"),
} as const satisfies Record<RivalId, string>;

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
  "cinder-wash": artUrl("clubhouse/flyers/cinder-wash.webp"),
  "hollow-pine-road": artUrl("clubhouse/flyers/hollow-pine-road.webp"),
  "ridge-road": artUrl("clubhouse/flyers/ridge-road.webp"),
  "slag-row": artUrl("clubhouse/flyers/slag-row.webp"),
} as const satisfies Record<RoadId, string>;
