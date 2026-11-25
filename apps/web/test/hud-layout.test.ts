import { readFileSync } from "node:fs";

import { MOST_RACERS } from "@racer/sim/race";
import { riderIdAt } from "@racer/sim/state";
import { describe, expect, it } from "vitest";

import { createTowerQuads } from "../src/game/hud-tower-quads.ts";
import type { TowerRow } from "../src/game/hud.ts";
import {
  cssOf,
  hudBands,
  towerRowsAt,
  warningFont,
} from "../src/hud-layout.ts";
import type { TowerRows, Viewport } from "../src/hud-layout.ts";
import {
  drawnRows,
  layoutAt,
  placeAt,
  placementFor,
  planFor,
} from "./tower-drawn.ts";

const phone: Viewport = { height: 844, width: 390 };
const smallPhone: Viewport = { height: 568, width: 320 };
const wide: readonly Viewport[] = [
  { height: 720, width: 1280 },
  { height: 860, width: 1512 },
  { height: 1080, width: 1920 },
  { height: 768, width: 1024 },
  { height: 400, width: 700 },
];

const fieldWithYouAt = (you: number): readonly TowerRow[] =>
  Array.from({ length: MOST_RACERS }, (_, at) => ({
    chip: 0xff_ff_ff,
    finished: false,
    id: riderIdAt(at),
    mark: at === 0 ? "lead" : "gap",
    name: `Rider ${at + 1}`,
    place: at + 1,
    tenths: 3,
    you: at + 1 === you,
  }));

const drawnPlaces = (rows: readonly TowerRow[], shown: TowerRows): number[] => {
  const placement = placementFor(phone, shown);
  const plan = planFor(
    new Map(rows.map((row) => [row.id, row.name])),
    placement
  );
  const quads = createTowerQuads();
  layoutAt(quads, rows, plan, placement, 0, false);
  placeAt(quads, 0);
  return drawnRows(quads, plan).map((row) => Number(row.text.split(" ")[0]));
};

const clearOfWarningAndNotice = (view: Viewport): boolean => {
  const shown = towerRowsAt(view);
  const bands = hudBands(
    view,
    shown,
    drawnPlaces(fieldWithYouAt(MOST_RACERS), shown).length
  );
  return (
    bands.tower.top >= bands.warning.bottom &&
    bands.tower.bottom <= bands.notice.top
  );
};

describe("the HUD's top band", () => {
  it("keeps a full field's tower under the cop warning and above the notice on a phone", () => {
    expect(towerRowsAt(phone)).toBe(5);
    expect([phone, smallPhone].map(clearOfWarningAndNotice)).toStrictEqual([
      true,
      true,
    ]);
  });

  it("shows the leader, then the riders around you, in a narrow window", () => {
    expect(
      [1, 2, 9, MOST_RACERS].map((you) =>
        drawnPlaces(fieldWithYouAt(you), towerRowsAt(phone))
      )
    ).toStrictEqual([
      [1, 2, 3, 4, 5],
      [1, 2, 3, 4, 5],
      [1, 7, 8, 9, 10],
      [1, 12, 13, 14, 15],
    ]);
  });

  it("keeps the whole field in wide windows, clear of every centred element", () => {
    const fits = wide.map((view) => {
      const bands = hudBands(view, towerRowsAt(view), MOST_RACERS);
      return {
        clear: bands.tower.left >= view.width / 2 + bands.centreHalf,
        rows: towerRowsAt(view),
      };
    });
    expect(new Set(fits.map((fit) => fit.rows))).toStrictEqual(
      new Set(["all"])
    );
    expect(fits.every((fit) => fit.clear)).toBeTruthy();
    expect(drawnPlaces(fieldWithYouAt(9), "all")).toHaveLength(MOST_RACERS);
  });

  it("sizes the warning band from the cop warning's own type token", () => {
    expect(
      readFileSync(
        new URL("../../../packages/ui/src/styles/globals.css", import.meta.url),
        "utf-8"
      )
    ).toContain(`--text-name: ${cssOf(warningFont)};`);
  });
});
