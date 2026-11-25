import { memo } from "react";

import type { TowerRow } from "../../game/hud.ts";

const standingOf = (row: TowerRow): string => {
  switch (row.mark) {
    case "lead": {
      return "Lead";
    }
    case "wrecked": {
      return "Wrecked";
    }
    case "busted": {
      return "Busted";
    }
    case "gap":
    case "blank": {
      return "";
    }
    default: {
      return row.mark satisfies never;
    }
  }
};

const sameOrder = (
  { rows: before }: { readonly rows: readonly TowerRow[] },
  { rows: after }: { readonly rows: readonly TowerRow[] }
): boolean =>
  before.length === after.length &&
  before.every((row, at) => {
    const next = after[at];
    return (
      next !== undefined &&
      next.id === row.id &&
      next.name === row.name &&
      next.finished === row.finished &&
      standingOf(next) === standingOf(row)
    );
  });

export const RaceOrder = memo(
  ({ rows }: { readonly rows: readonly TowerRow[] }) => (
    <ol aria-label="Race order" className="sr-only">
      {rows.map((row) => (
        <li key={row.id}>
          {[
            row.place,
            row.name,
            row.finished ? "Finished" : "",
            standingOf(row),
          ]
            .filter((part) => part !== "")
            .join(" ")}
        </li>
      ))}
    </ol>
  ),
  sameOrder
);
