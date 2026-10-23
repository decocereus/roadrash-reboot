import type { RoadId } from "@racer/career/tables";
import type { OfficerId, RivalId } from "@racer/sim/cast";

import badgePlate from "./clubhouse/badge.webp?url";
import counterPlate from "./clubhouse/bar/counter.webp?url";
import duskPlate from "./clubhouse/bar/dusk.webp?url";
import nightPlate from "./clubhouse/bar/night.webp?url";
import raysPlate from "./clubhouse/bar/rays.webp?url";
import stoolPlate from "./clubhouse/bar/stool.webp?url";
import agnesMulcahyBill from "./clubhouse/bills/agnes-mulcahy.webp?url";
import bennyOkaforBill from "./clubhouse/bills/benny-okafor.webp?url";
import coachDaleHuttoBill from "./clubhouse/bills/coach-dale-hutto.webp?url";
import deeSantangeloBill from "./clubhouse/bills/dee-santangelo.webp?url";
import felixAurandBill from "./clubhouse/bills/felix-aurand.webp?url";
import gusAbernathyBill from "./clubhouse/bills/gus-abernathy.webp?url";
import hollisThorneBill from "./clubhouse/bills/hollis-thorne.webp?url";
import inesMarchettiBill from "./clubhouse/bills/ines-marchetti.webp?url";
import junoKadeBill from "./clubhouse/bills/juno-kade.webp?url";
import lyleGorskiBill from "./clubhouse/bills/lyle-gorski.webp?url";
import magsDunleavyBill from "./clubhouse/bills/mags-dunleavy.webp?url";
import orrinBlackwellBill from "./clubhouse/bills/orrin-blackwell.webp?url";
import ruthAnnBixbyBill from "./clubhouse/bills/ruth-ann-bixby.webp?url";
import smokeFuelBill from "./clubhouse/bills/smoke-fuel.webp?url";
import tristanLuxBill from "./clubhouse/bills/tristan-lux.webp?url";
import wandaPruittBill from "./clubhouse/bills/wanda-pruitt.webp?url";
import breakwaterRunFlyer from "./clubhouse/flyers/breakwater-run.webp?url";
import cinderWashFlyer from "./clubhouse/flyers/cinder-wash.webp?url";
import hollowPineRoadFlyer from "./clubhouse/flyers/hollow-pine-road.webp?url";
import ridgeRoadFlyer from "./clubhouse/flyers/ridge-road.webp?url";
import slagRowFlyer from "./clubhouse/flyers/slag-row.webp?url";
import noteCyanPlate from "./clubhouse/note-cyan.webp?url";
import noteMagentaPlate from "./clubhouse/note-magenta.webp?url";
import doloresPikeFigure from "./clubhouse/officers/dolores-pike.webp?url";
import wendellHavertyFigure from "./clubhouse/officers/wendell-haverty.webp?url";
import agnesMulcahyFigure from "./clubhouse/rivals/agnes-mulcahy.webp?url";
import bennyOkaforFigure from "./clubhouse/rivals/benny-okafor.webp?url";
import coachDaleHuttoFigure from "./clubhouse/rivals/coach-dale-hutto.webp?url";
import deeSantangeloFigure from "./clubhouse/rivals/dee-santangelo.webp?url";
import felixAurandFigure from "./clubhouse/rivals/felix-aurand.webp?url";
import gusAbernathyFigure from "./clubhouse/rivals/gus-abernathy.webp?url";
import hollisThorneFigure from "./clubhouse/rivals/hollis-thorne.webp?url";
import inesMarchettiFigure from "./clubhouse/rivals/ines-marchetti.webp?url";
import junoKadeFigure from "./clubhouse/rivals/juno-kade.webp?url";
import lyleGorskiFigure from "./clubhouse/rivals/lyle-gorski.webp?url";
import magsDunleavyFigure from "./clubhouse/rivals/mags-dunleavy.webp?url";
import mooseKowalczykFigure from "./clubhouse/rivals/moose-kowalczyk.webp?url";
import orrinBlackwellFigure from "./clubhouse/rivals/orrin-blackwell.webp?url";
import ruthAnnBixbyFigure from "./clubhouse/rivals/ruth-ann-bixby.webp?url";
import tristanLuxFigure from "./clubhouse/rivals/tristan-lux.webp?url";
import wandaPruittFigure from "./clubhouse/rivals/wanda-pruitt.webp?url";
import speechPlate from "./clubhouse/speech.webp?url";
import standingsPlate from "./clubhouse/standings.webp?url";
import antlerWingSticker from "./clubhouse/stickers/antler-wing.webp?url";
import chequeredTyreSticker from "./clubhouse/stickers/chequered-tyre.webp?url";
import clubMSticker from "./clubhouse/stickers/club-m.webp?url";
import crossedCrownSticker from "./clubhouse/stickers/crossed-crown.webp?url";
import skullHelmetSticker from "./clubhouse/stickers/skull-helmet.webp?url";
import stencilMSticker from "./clubhouse/stickers/stencil-m.webp?url";
import wallPlate from "./clubhouse/wall.webp?url";

export const plates = {
  badge: badgePlate,
  counter: counterPlate,
  dusk: duskPlate,
  night: nightPlate,
  noteCyan: noteCyanPlate,
  noteMagenta: noteMagentaPlate,
  rays: raysPlate,
  speech: speechPlate,
  standings: standingsPlate,
  stool: stoolPlate,
  wall: wallPlate,
} as const;

export const figures = {
  "agnes-mulcahy": agnesMulcahyFigure,
  "benny-okafor": bennyOkaforFigure,
  "coach-dale-hutto": coachDaleHuttoFigure,
  "dee-santangelo": deeSantangeloFigure,
  "felix-aurand": felixAurandFigure,
  "gus-abernathy": gusAbernathyFigure,
  "hollis-thorne": hollisThorneFigure,
  "ines-marchetti": inesMarchettiFigure,
  "juno-kade": junoKadeFigure,
  "lyle-gorski": lyleGorskiFigure,
  "mags-dunleavy": magsDunleavyFigure,
  "moose-kowalczyk": mooseKowalczykFigure,
  "orrin-blackwell": orrinBlackwellFigure,
  "ruth-ann-bixby": ruthAnnBixbyFigure,
  "tristan-lux": tristanLuxFigure,
  "wanda-pruitt": wandaPruittFigure,
} as const satisfies Record<RivalId, string>;

export const officerFigures = {
  "dolores-pike": doloresPikeFigure,
  "wendell-haverty": wendellHavertyFigure,
} as const satisfies Record<OfficerId, string>;

export const bills = {
  "agnes-mulcahy": agnesMulcahyBill,
  "benny-okafor": bennyOkaforBill,
  "coach-dale-hutto": coachDaleHuttoBill,
  "dee-santangelo": deeSantangeloBill,
  "felix-aurand": felixAurandBill,
  "gus-abernathy": gusAbernathyBill,
  "hollis-thorne": hollisThorneBill,
  "ines-marchetti": inesMarchettiBill,
  "juno-kade": junoKadeBill,
  "lyle-gorski": lyleGorskiBill,
  "mags-dunleavy": magsDunleavyBill,
  "moose-kowalczyk": smokeFuelBill,
  "orrin-blackwell": orrinBlackwellBill,
  "ruth-ann-bixby": ruthAnnBixbyBill,
  "tristan-lux": tristanLuxBill,
  "wanda-pruitt": wandaPruittBill,
} as const satisfies Record<RivalId, string>;

export const stickers: readonly string[] = [
  stencilMSticker,
  antlerWingSticker,
  chequeredTyreSticker,
  clubMSticker,
  crossedCrownSticker,
  skullHelmetSticker,
];

export const flyers = {
  "breakwater-run": breakwaterRunFlyer,
  "cinder-wash": cinderWashFlyer,
  "hollow-pine-road": hollowPineRoadFlyer,
  "ridge-road": ridgeRoadFlyer,
  "slag-row": slagRowFlyer,
} as const satisfies Record<RoadId, string>;
