import { createRaceLog } from "@racer/career/outcome";
import type { RaceLog } from "@racer/career/outcome";
import type { RiderView } from "@racer/sim/race-view";
import { riderOf } from "@racer/sim/state";
import type { RiderId } from "@racer/sim/state";
import { intervalAhead } from "@racer/sim/timing";
import type { TimingView } from "@racer/sim/timing";

import { shortNames } from "../career/copy.ts";
import { suitOf } from "./figure-rig.ts";
import type { Session } from "./game-session.ts";
import type { RacePlan, TowerMark, TowerRow } from "./hud.ts";
import { blocksOf } from "./rider-blocks.ts";
import type { Stage } from "./scene-lifecycle.ts";

interface Entry {
  readonly name: string;
  readonly chip: number;
}

const MS_PER_TENTH = 100;
const HALF_TENTH_MS = MS_PER_TENTH / 2;

export const nearestTenth = (ms: number): number => {
  const shifted = ms + HALF_TENTH_MS;
  const remainder = shifted % MS_PER_TENTH;
  const tenths = (shifted - remainder) / MS_PER_TENTH;
  return remainder < 0 ? tenths - 1 : tenths;
};

const noRows: readonly TowerRow[] = [];

type OnRoad = Extract<Session, { readonly log: RaceLog }>;

const nameOf = (
  rider: RiderView,
  plan: RacePlan,
  entrants: RaceLog["entrants"],
  me: RiderId
): string => {
  if (rider.id === me) {
    return "You";
  }
  const entrant = entrants.find((one) => one.rider === rider.id);
  return entrant
    ? (plan.room?.names.get(entrant.rival) ?? shortNames[entrant.rival])
    : rider.profile.name;
};

const entriesOf = (
  session: OnRoad,
  stage: Pick<Stage, "colours" | "me" | "race">
): ReadonlyMap<RiderId, Entry> => {
  const entries = new Map<RiderId, Entry>();
  for (const rider of stage.race.view.riders) {
    entries.set(rider.id, {
      chip: suitOf(rider, blocksOf(stage.colours, rider.id), session.dressing),
      name: nameOf(rider, session.plan, session.log.entrants, stage.me),
    });
  }
  return entries;
};

export const towerNames = (
  plan: RacePlan,
  stage: Pick<Stage, "me" | "race">
): ReadonlyMap<RiderId, string> => {
  const { entrants } = createRaceLog(plan.setup, stage.me);
  const names = new Map<RiderId, string>();
  for (const rider of stage.race.view.riders) {
    if (rider.profile.role === "racer") {
      names.set(rider.id, nameOf(rider, plan, entrants, stage.me));
    }
  }
  return names;
};

interface Mark {
  mark: TowerMark;
  tenths: number;
}

const markInto = (
  into: Mark,
  timing: TimingView,
  tick: number,
  rider: RiderView,
  ahead: RiderView | undefined
): void => {
  into.tenths = 0;
  if (rider.mode === "wrecked") {
    into.mark = "wrecked";
  } else if (rider.mode === "busted") {
    into.mark = "busted";
  } else if (ahead) {
    const gap = intervalAhead(timing, tick, rider, ahead);
    into.mark = gap === "unknown" ? "blank" : "gap";
    into.tenths = gap === "unknown" ? 0 : nearestTenth(gap);
  } else {
    into.mark = "lead";
  }
};

const shows = (
  row: TowerRow | undefined,
  rider: RiderView,
  entry: Entry,
  place: number,
  { mark, tenths }: Mark
): row is TowerRow =>
  row !== undefined &&
  row.id === rider.id &&
  row.place === place &&
  row.mark === mark &&
  row.tenths === tenths &&
  row.finished === rider.finishTick >= 0 &&
  row.name === entry.name &&
  row.chip === entry.chip;

export const createTower = () => {
  let entriesFor: RaceLog | null = null;
  let entries: ReadonlyMap<RiderId, Entry> = new Map();
  let shown = noRows;
  const marked: Mark = { mark: "lead", tenths: 0 };

  const read = (
    session: Session,
    stage: Pick<Stage, "colours" | "me" | "race">,
    order: readonly RiderId[]
  ): readonly TowerRow[] => {
    if (session.phase !== "countdown" && session.phase !== "racing") {
      shown = noRows;
      return shown;
    }
    if (entriesFor !== session.log) {
      entries = entriesOf(session, stage);
      entriesFor = session.log;
    }
    const { timing, view } = stage.race;
    let next: TowerRow[] | null = null;
    let count = 0;
    let ahead: RiderView | undefined;
    for (const id of order) {
      const rider = riderOf(view.riders, id);
      const entry = entries.get(id);
      if (rider && entry) {
        markInto(marked, timing, view.tick, rider, ahead);
        const place = count + 1;
        const before = shown[count];
        if (!shows(before, rider, entry, place, marked)) {
          next ??= shown.slice(0, count);
          next.push({
            chip: entry.chip,
            finished: rider.finishTick >= 0,
            id: rider.id,
            mark: marked.mark,
            name: entry.name,
            place,
            tenths: marked.tenths,
            you: rider.id === stage.me,
          });
        } else if (next) {
          next.push(before);
        }
        count += 1;
        ahead = rider;
      }
    }
    if (next === null && count !== shown.length) {
      next = shown.slice(0, count);
    }
    if (next) {
      shown = next;
    }
    return shown;
  };

  return { read };
};
