import { memo } from "react";

import type { TowerRow } from "../../game/hud.ts";

const standingOf = (row: TowerRow): string => {
  switch (row.mark) {
    case "lead": {
      return "Lead";
    }
    case "gap": {
      return `+${(row.tenths / 10).toFixed(1)}`;
    }
    case "wrecked": {
      return "Wrecked";
    }
    case "busted": {
      return "Busted";
    }
    case "blank": {
      return "";
    }
    default: {
      return row.mark satisfies never;
    }
  }
};

const lineOf = (row: TowerRow): string =>
  [row.place, row.name, row.finished ? "Finished" : "", standingOf(row)]
    .filter((part) => part !== "")
    .join(" ");

interface Order {
  readonly rows: readonly TowerRow[];
}

export const sameLines = ({ rows: before }: Order, { rows: after }: Order) =>
  before.length === after.length &&
  before.every((row, at) => {
    const next = after[at];
    return next?.id === row.id && lineOf(next) === lineOf(row);
  });

export const RaceOrder = memo(
  ({ rows }: Order) => (
    <ol aria-label="Race order" className="sr-only">
      {rows.map((row) => (
        <li key={row.id}>{lineOf(row)}</li>
      ))}
    </ol>
  ),
  sameLines
);
