import type { RaceLog } from "@racer/career/outcome";
import type { GuestNames } from "@racer/career/room-race";
import { blockCssOf, riderPalette } from "@racer/sim/palette";
import type { RaceView, RiderView } from "@racer/sim/race-view";
import { riderOf } from "@racer/sim/state";
import type { RiderId } from "@racer/sim/state";
import { intervalAhead } from "@racer/sim/timing";

import { shortNames } from "../career/copy.ts";
import type { Session } from "./game-session.ts";
import type { TowerMark, TowerRow } from "./hud.ts";
import type { Stage } from "./scene-lifecycle.ts";

interface Entry {
  readonly name: string;
  readonly chip: string;
}

interface TowerRace {
  readonly view: RaceView;
  readonly order: readonly RiderId[];
  readonly me: RiderId;
  readonly log: RaceLog;
  readonly names: GuestNames | undefined;
  readonly colours: ReadonlyMap<RiderId, number>;
}

const noRows: readonly TowerRow[] = [];

const suitCssOf = (jacket: number): string =>
  `#${(riderPalette[jacket]?.jacket ?? 0).toString(16).padStart(6, "0")}`;

const entriesOf = ({
  colours,
  log,
  me,
  names,
  view,
}: TowerRace): ReadonlyMap<RiderId, Entry> => {
  const entries = new Map<RiderId, Entry>();
  for (const rider of view.riders) {
    const entrant = log.entrants.find((one) => one.rider === rider.id);
    const block = colours.get(rider.id);
    const named = entrant
      ? (names?.get(entrant.rival) ?? shortNames[entrant.rival])
      : rider.profile.name;
    entries.set(rider.id, {
      chip:
        block === undefined
          ? suitCssOf(rider.profile.jacket)
          : blockCssOf(block),
      name: rider.id === me ? "You" : named,
    });
  }
  return entries;
};

const markOf = (
  tick: number,
  rider: RiderView,
  ahead: RiderView | undefined
): readonly [TowerMark, number] => {
  if (rider.mode === "wrecked") {
    return ["wrecked", 0];
  }
  if (rider.mode === "busted") {
    return ["busted", 0];
  }
  if (!ahead) {
    return ["lead", 0];
  }
  const gap = intervalAhead(tick, rider, ahead);
  if (gap === "unknown") {
    return ["blank", 0];
  }
  if (gap === "beyond") {
    return ["far", 0];
  }
  return ["gap", Math.round(gap * 10)];
};

const sameRow = (left: TowerRow, right: TowerRow | undefined): boolean =>
  right !== undefined &&
  left.id === right.id &&
  left.mark === right.mark &&
  left.tenths === right.tenths &&
  left.finished === right.finished &&
  left.name === right.name &&
  left.chip === right.chip;

const sameRows = (
  next: readonly TowerRow[],
  shown: readonly TowerRow[]
): boolean =>
  next.length === shown.length &&
  next.every((row) => sameRow(row, shown[row.place - 1]));

export const createTower = () => {
  let entriesFor: RaceLog | null = null;
  let entries: ReadonlyMap<RiderId, Entry> = new Map();
  let shown = noRows;

  const rowsOf = (race: TowerRace): readonly TowerRow[] => {
    if (entriesFor !== race.log) {
      entries = entriesOf(race);
      entriesFor = race.log;
    }
    const { order, view } = race;
    const rows: TowerRow[] = [];
    let ahead: RiderView | undefined;
    for (let place = 0; place < order.length; place += 1) {
      const id = order[place] ?? null;
      const rider = riderOf(view.riders, id);
      const entry = id === null ? undefined : entries.get(id);
      if (rider && entry) {
        const [mark, tenths] = markOf(view.tick, rider, ahead);
        rows.push({
          chip: entry.chip,
          finished: rider.finishTick >= 0,
          id: rider.id,
          mark,
          name: entry.name,
          place: place + 1,
          tenths,
          you: rider.id === race.me,
        });
        ahead = rider;
      }
    }
    if (!sameRows(rows, shown)) {
      shown = rows;
    }
    return shown;
  };

  const read = (
    session: Session,
    stage: Pick<Stage, "colours" | "me" | "race">,
    order: readonly RiderId[]
  ): readonly TowerRow[] => {
    if (session.phase !== "countdown" && session.phase !== "racing") {
      shown = noRows;
      return shown;
    }
    return rowsOf({
      colours: stage.colours,
      log: session.log,
      me: stage.me,
      names: session.plan.room?.names,
      order,
      view: stage.race.view,
    });
  };

  return { read };
};
