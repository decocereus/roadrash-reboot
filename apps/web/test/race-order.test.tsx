import { riderIdAt } from "@racer/sim/state";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { RaceOrder, sameLines } from "../src/components/screens/race-order.tsx";
import type { TowerRow } from "../src/game/hud.ts";

const row = (at: number, change: Partial<TowerRow>): TowerRow => ({
  chip: 0xff_ff_ff,
  finished: false,
  id: riderIdAt(at),
  mark: "gap",
  name: `Rider ${at + 1}`,
  place: at + 1,
  tenths: 0,
  you: false,
  ...change,
});

const rows: readonly TowerRow[] = [
  row(0, { mark: "lead" }),
  row(1, { tenths: 83 }),
  row(2, { mark: "blank" }),
  row(3, { finished: true, tenths: 125 }),
  row(4, { mark: "wrecked" }),
  row(5, { mark: "busted" }),
];

const linesOf = (shown: readonly TowerRow[]): readonly string[] =>
  [
    ...renderToStaticMarkup(<RaceOrder rows={shown} />).matchAll(
      /<li>(?<line>[^<]*)<\/li>/gu
    ),
  ].map((match) => match.groups?.line ?? "");

describe("the race order a screen reader reads", () => {
  it("reads each rider's place, name, finish and interval, and nothing for an unknown interval", () => {
    expect(linesOf(rows)).toStrictEqual([
      "1 Rider 1 Lead",
      "2 Rider 2 +8.3",
      "3 Rider 3",
      "4 Rider 4 Finished +12.5",
      "5 Rider 5 Wrecked",
      "6 Rider 6 Busted",
    ]);
  });

  it("is not a live region, so a changing interval is read only when the player reaches it", () => {
    expect(renderToStaticMarkup(<RaceOrder rows={rows} />)).not.toMatch(
      /aria-live|role="(?:log|status|alert)"/u
    );
  });

  it("writes the list again when a shown interval changes, and not for a change it does not show", () => {
    const later = rows.map((shown, at) =>
      at === 1 ? { ...shown, tenths: 84 } : shown
    );
    const recoloured = rows.map((shown) => ({ ...shown, chip: 0 }));
    expect({
      interval: sameLines({ rows }, { rows: later }),
      unseen: sameLines({ rows }, { rows: recoloured }),
    }).toStrictEqual({ interval: false, unseen: true });
  });
});
