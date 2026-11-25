import { createRaceLog } from "@racer/career/outcome";
import { celebritySuits } from "@racer/sim/cast";
import { riderBlocks, riderPalette } from "@racer/sim/palette";
import { MOST_RACERS, standings } from "@racer/sim/race";
import { TICK_RATE, riderIdAt, riderOf } from "@racer/sim/state";
import type { RaceState, RiderId, RiderState } from "@racer/sim/state";
import * as THREE from "three";
import { describe, expect, it } from "vitest";

import type { Dressing } from "../src/game/figure-wardrobe.ts";
import { countdownFor, racingFrom } from "../src/game/game-session.ts";
import {
  CELL_FIELDS,
  CELL_ORIGIN_X,
  CHIP_CELL,
  FIRST_NAME_CELL,
  FLAG_CELL,
} from "../src/game/hud-tower-atlas.ts";
import type { AtlasPlan } from "../src/game/hud-tower-atlas.ts";
import { SLIDE_MS, createTowerQuads } from "../src/game/hud-tower-quads.ts";
import type { Placement, TowerQuads } from "../src/game/hud-tower-quads.ts";
import { createTower, towerNames } from "../src/game/hud-tower.ts";
import type { RacePlan, TowerRow } from "../src/game/hud.ts";
import { roomRunStub } from "./room-run-stub.ts";
import {
  drawnRows,
  layoutAt,
  placeAt,
  placementFor,
  planFor,
  wideView,
} from "./tower-drawn.ts";
import type { DrawnRow } from "./tower-drawn.ts";
import { noControls, rideFor, soloPlan } from "./tower-ride.ts";
import type { Ride } from "./tower-ride.ts";

const TEXT = 0xf2_ee_e6;
const YELLOW = 0xff_c5_31;
const CLOSE_TICKS = 600;
const CSS_EASE_OUT_AT_QUARTER = 0.3781;
const CSS_EASE_OUT_AT_HALF = 0.6846;

const roomPlan: RacePlan = {
  ...soloPlan,
  room: roomRunStub(soloPlan.setup, "tower-room"),
};

const rowsOf = (
  tower: ReturnType<typeof createTower>,
  { session, stage, state }: Ride
): readonly TowerRow[] => tower.read(session, stage, standings(state));

const riderAtPlace = (state: RaceState, place: number): RiderState => {
  const rider = riderOf(state.riders, standings(state)[place - 1] ?? null);
  if (!rider) {
    throw new Error(`No rider holds place ${place}.`);
  }
  return rider;
};

const paintedBody = {
  atlas: null,
  bones: [],
  poses: new Map(),
  primitives: [],
  scene: new THREE.Object3D(),
  seat: new THREE.Vector3(),
  standHeight: 0,
  url: "/models/painted.glb",
};

const wide = placementFor(wideView, "all");

const drawOf = (
  rows: readonly TowerRow[],
  placement: Placement = wide,
  now = 0,
  quads = createTowerQuads()
): readonly DrawnRow[] => {
  const plan = planFor(
    new Map(rows.map((row) => [row.id, row.name])),
    placement
  );
  layoutAt(quads, rows, plan, placement, now, false);
  placeAt(quads, now);
  return drawnRows(quads, plan);
};

const textsOf = (rows: readonly TowerRow[]): readonly string[] =>
  drawOf(rows).map((row) => row.text);

const fieldOf = (youAt: number, order: readonly number[]): TowerRow[] =>
  order.map((slot, at) => ({
    chip: 0xff_ff_ff,
    finished: false,
    id: riderIdAt(slot),
    mark: at === 0 ? "lead" : "gap",
    name: `Rider ${slot + 1}`,
    place: at + 1,
    tenths: 3,
    you: slot === youAt,
  }));

const markOf = (row: DrawnRow | undefined): string => {
  const mark = row?.text.split(" ").at(-1) ?? "";
  return /^(?:LEAD|\+\d+\.\d)$/u.test(mark) ? "timed" : mark;
};

interface Span {
  nameEnd: number;
  markStart: number;
  markEnd: number;
}

const spansOf = (quads: TowerQuads, plan: AtlasPlan): readonly Span[] => {
  const spans: Span[] = [];
  for (let quad = 0; quad < quads.quadCount(); quad += 1) {
    const slot = quads.slotOf[quad] ?? -1;
    const cell = quads.cellOf[quad] ?? -1;
    const pen =
      (quads.positions[quad * 8] ?? 0) +
      (plan.cells[cell * CELL_FIELDS + CELL_ORIGIN_X] ?? 0);
    const end = pen + (plan.advances[cell] ?? 0);
    const span = spans[slot] ?? {
      markEnd: Number.NEGATIVE_INFINITY,
      markStart: Number.POSITIVE_INFINITY,
      nameEnd: Number.NaN,
    };
    spans[slot] = span;
    if (slot < 0 || (quads.fills[quad * 16 + 3] ?? 0) === 0) {
      continue;
    }
    if (cell >= FIRST_NAME_CELL) {
      span.nameEnd = quads.positions[quad * 8 + 2] ?? 0;
    } else if (!Number.isNaN(span.nameEnd) && cell !== FLAG_CELL) {
      span.markStart = Math.min(span.markStart, quads.positions[quad * 8] ?? 0);
      span.markEnd = Math.max(span.markEnd, Math.round(end));
    }
  }
  return spans;
};

const topOf = (rows: readonly DrawnRow[], name: string): number =>
  rows.find((row) => row.text.includes(name))?.top ?? Number.NaN;

describe("the timing tower", () => {
  it("draws every racer in the order the place tag reads, and no cop", () => {
    const ride = rideFor(soloPlan, 30);
    const rows = rowsOf(createTower(), ride);
    const racers = ride.state.riders.filter(
      (rider) => rider.profile.role === "racer"
    );
    expect(ride.state.riders.length).toBeGreaterThan(racers.length);
    expect(rows.map((row) => row.id)).toStrictEqual(standings(ride.state));
    expect(rows).toHaveLength(racers.length);
    const heads = rows.map((row, at) => `${at + 1} ${row.name.toUpperCase()}`);
    expect(
      drawOf(rows).map((row, at) => row.text.slice(0, heads[at]?.length))
    ).toStrictEqual(heads);
  });

  it("marks the leader, gives every other rider a gap and names the player You in yellow", () => {
    const rows = rowsOf(createTower(), rideFor(soloPlan, 30));
    const drawn = drawOf(rows);
    expect(drawn[0]?.text.endsWith(" LEAD")).toBeTruthy();
    expect(
      drawn.slice(1).filter((row) => !/ \+\d+\.\d$/u.test(row.text))
    ).toStrictEqual([]);
    expect(
      drawn
        .filter((row) => row.colour === YELLOW)
        .map((row) => ({ bar: row.bar, name: row.text.split(" ")[1] }))
    ).toStrictEqual([{ bar: true, name: "YOU" }]);
    expect(drawn.filter((row) => row.colour === TEXT && !row.bar)).toHaveLength(
      rows.length - 1
    );
  });

  it("shows a wrecked, a busted and a finished rider at a glance", () => {
    const ride = rideFor(soloPlan, 30);
    const [finished, wrecked, busted] = [2, 3, 4].map((place) =>
      riderAtPlace(ride.state, place)
    );
    if (!finished || !wrecked || !busted) {
      throw new Error("The race has fewer than four racers.");
    }
    finished.finishTick = ride.state.tick - 30;
    wrecked.mode = "wrecked";
    busted.mode = "busted";
    const rows = rowsOf(createTower(), ride);
    const drawn = drawOf(rows);
    const byId = (rider: RiderState) =>
      drawn[rows.findIndex((row) => row.id === rider.id)];
    expect(
      [finished, wrecked, busted].map((rider) => ({
        alpha: byId(rider)?.alpha,
        flag: byId(rider)?.flag,
        mark: markOf(byId(rider)),
      }))
    ).toStrictEqual([
      { alpha: 1, flag: true, mark: "timed" },
      { alpha: 0.5, flag: false, mark: "WRECKED" },
      { alpha: 0.5, flag: false, mark: "BUSTED" },
    ]);
    expect(drawn[0]?.text.endsWith(" LEAD")).toBeTruthy();
    expect(drawn.some((row) => / \+\d+\.\d$/u.test(row.text))).toBeTruthy();
    expect(drawn.filter((row) => row.flag)).toHaveLength(1);
    expect(drawn.map((row) => row.text).join("\n")).not.toMatch(/[—·]/u);
  });

  it("gives each chip the colour the rider wears on the road", () => {
    const ride = rideFor(soloPlan, 30);
    const [painted, blocked, plain] = [2, 3, 4].map((place) =>
      riderAtPlace(ride.state, place)
    );
    if (!painted || !blocked || !plain) {
      throw new Error("The race has fewer than four racers.");
    }
    const dressing: Dressing = new Map([
      [painted.id, { body: paintedBody, suit: celebritySuits.ronaldo }],
    ]);
    const rows = rowsOf(createTower(), {
      ...ride,
      session: racingFrom(
        countdownFor(soloPlan, createRaceLog(soloPlan.setup), dressing)
      ),
      stage: { ...ride.stage, colours: new Map([[blocked.id, 0]]) },
    });
    const drawn = drawOf(rows);
    const chipOf = (rider: RiderState) =>
      drawn[rows.findIndex((row) => row.id === rider.id)]?.chip;
    expect([painted, blocked, plain].map(chipOf)).toStrictEqual([
      celebritySuits.ronaldo,
      riderBlocks[0]?.suit ?? -1,
      riderPalette[plain.profile.jacket]?.jacket ?? -1,
    ]);
  });

  it("rings each chip in the text colour at 70%, halved with the row when a rider is out", () => {
    const rows = fieldOf(0, [0, 1]).map((row, at) =>
      at === 1 ? { ...row, mark: "wrecked" as const } : row
    );
    const quads = createTowerQuads();
    const plan = planFor(new Map(rows.map((row) => [row.id, row.name])), wide);
    layoutAt(quads, rows, plan, wide, 0, false);
    placeAt(quads, 0);
    const rings = Array.from({ length: quads.quadCount() }, (_, quad) => quad)
      .filter((quad) => quads.cellOf[quad] === CHIP_CELL)
      .map((quad) => ({
        alpha: Math.round((quads.edges[quad * 16 + 3] ?? 0) * 100) / 100,
        colour: [0, 1, 2].map((channel) =>
          Math.round((quads.edges[quad * 16 + channel] ?? 0) * 255)
        ),
      }));
    expect(rings).toStrictEqual([
      { alpha: 0.7, colour: [0xf2, 0xee, 0xe6] },
      { alpha: 0.35, colour: [0xf2, 0xee, 0xe6] },
    ]);
  });

  it("draws a dropped room rider like any other rider", () => {
    const ride = rideFor(roomPlan, 30);
    const rival = riderAtPlace(ride.state, 2);
    rival.controller = "human";
    const seated = drawOf(rowsOf(createTower(), ride));
    rival.controller = "pilot";
    expect(drawOf(rowsOf(createTower(), ride))).toStrictEqual(seated);
  });

  it("bakes the names race preparation reads, so the race never bakes again", () => {
    const ride = rideFor(roomPlan, 30);
    const prepared = planFor(towerNames(roomPlan, ride.stage), wide);
    const rows = rowsOf(createTower(), ride);
    expect(
      rows.every((row) => prepared.sources[row.id] === row.name)
    ).toBeTruthy();
  });

  it("slides a row to its new place over 220 ms on an ease-out and moves nothing else", () => {
    const quads = createTowerQuads();
    const before = fieldOf(4, [0, 1, 2, 3, 4, 5]);
    const after = fieldOf(4, [0, 1, 2, 4, 3, 5]);
    const plan = planFor(
      new Map(before.map((row) => [row.id, row.name])),
      wide
    );
    const rowsTop = wide.frame.top + wide.frame.pad;
    const shift = (slots: number) =>
      Math.round(rowsTop + (4 - slots) * wide.frame.row) -
      Math.round(rowsTop + 4 * wide.frame.row);
    layoutAt(quads, before, plan, wide, 0, false);
    placeAt(quads, 0);
    const settled = drawnRows(quads, plan);
    const startAt = 1000;
    layoutAt(quads, after, plan, wide, startAt, false);
    const frames = [0, SLIDE_MS / 4, SLIDE_MS / 2, SLIDE_MS, SLIDE_MS + 1].map(
      (ms) => ({
        moving: placeAt(quads, startAt + ms),
        rows: drawnRows(quads, plan),
      })
    );
    const youFrom = topOf(settled, "RIDER 5");
    expect(
      frames.map(({ moving, rows }) => ({
        moving,
        others: [0, 1, 2, 5].map((slot) => rows[slot]?.top),
        you: topOf(rows, "RIDER 5") - youFrom,
      }))
    ).toStrictEqual([
      {
        moving: true,
        others: [0, 1, 2, 5].map((slot) => settled[slot]?.top),
        you: 0,
      },
      {
        moving: true,
        others: [0, 1, 2, 5].map((slot) => settled[slot]?.top),
        you: shift(CSS_EASE_OUT_AT_QUARTER),
      },
      {
        moving: true,
        others: [0, 1, 2, 5].map((slot) => settled[slot]?.top),
        you: shift(CSS_EASE_OUT_AT_HALF),
      },
      {
        moving: false,
        others: [0, 1, 2, 5].map((slot) => settled[slot]?.top),
        you: shift(1),
      },
      {
        moving: false,
        others: [0, 1, 2, 5].map((slot) => settled[slot]?.top),
        you: shift(1),
      },
    ]);
  });

  it("moves a row at once when the player asks for reduced motion", () => {
    const quads = createTowerQuads();
    const before = fieldOf(4, [0, 1, 2, 3, 4]);
    const plan = planFor(
      new Map(before.map((row) => [row.id, row.name])),
      wide
    );
    layoutAt(quads, before, plan, wide, 0, true);
    placeAt(quads, 0);
    const settled = drawnRows(quads, plan);
    layoutAt(quads, fieldOf(4, [0, 1, 2, 4, 3]), plan, wide, 1000, true);
    expect({
      moving: placeAt(quads, 1000),
      tops: drawnRows(quads, plan).map((row) => row.top),
    }).toStrictEqual({
      moving: false,
      tops: settled.map((row) => row.top),
    });
  });

  it("keeps a close rider's row while its shown gap holds and never draws a minus gap", () => {
    const ride = rideFor(soloPlan, 20);
    const tower = createTower();
    let rows = rowsOf(tower, ride);
    let texts = textsOf(rows).join("\n");
    let close = 0;
    let minus = 0;
    let rebuilt = 0;
    for (let tick = 0; tick < CLOSE_TICKS; tick += 1) {
      ride.stage.race.step(noControls);
      const next = rowsOf(tower, ride);
      const drawn = textsOf(next).join("\n");
      close += next.some((row) => row.mark === "gap" && row.tenths === 0)
        ? 1
        : 0;
      minus += drawn.includes("+-") ? 1 : 0;
      rebuilt += drawn === texts && next !== rows ? 1 : 0;
      rows = next;
      texts = drawn;
    }
    expect({ close: close > 0, minus, rebuilt }).toStrictEqual({
      close: true,
      minus: 0,
      rebuilt: 0,
    });
  });

  it("draws a gap below the rider ahead with its minus, as the interval reads", () => {
    const rows: TowerRow[] = fieldOf(0, [0, 1, 2]).map((row, at) => ({
      ...row,
      tenths: [0, -1, 123][at] ?? 0,
    }));
    expect(textsOf(rows)).toStrictEqual([
      "1 RIDER 1 LEAD",
      "2 RIDER 2 +-0.1",
      "3 RIDER 3 +12.3",
    ]);
  });

  it("hands the tower the same rows while nothing it shows has changed", () => {
    const ride = rideFor(soloPlan, 30);
    const tower = createTower();
    const first = rowsOf(tower, ride);
    expect(rowsOf(tower, ride)).toBe(first);
    for (let tick = 0; tick < TICK_RATE; tick += 1) {
      ride.stage.race.step(noControls);
    }
    expect(rowsOf(tower, ride)).not.toBe(first);
  });

  it("cuts a long name with an ellipsis so the interval column never moves", () => {
    const long = "A".repeat(80);
    const rows: TowerRow[] = fieldOf(0, [0, 1, 2, 3, 4]).map((row, at) => ({
      ...row,
      finished: at === 3,
      mark: at === 4 ? "blank" : row.mark,
      name: at < 2 ? row.name : `${long}${at}`,
    }));
    const quads = createTowerQuads();
    const plan = planFor(new Map(rows.map((row) => [row.id, row.name])), wide);
    layoutAt(quads, rows, plan, wide, 0, false);
    placeAt(quads, 0);
    const spans = spansOf(quads, plan);
    const panelRight = Math.round(
      (wide.frame.left + wide.frame.width) * wide.scaleX
    );
    const [, short, cut, finished, unknown] = spans;
    expect({
      clear: spans.every((span) => span.nameEnd <= span.markStart),
      cut: drawnRows(quads, plan)
        .slice(2)
        .map((row) => row.text.split(" ")[1]?.endsWith("…")),
      finishedShorter: (finished?.nameEnd ?? 0) < (cut?.nameEnd ?? 0),
      inside: (short?.markEnd ?? 0) <= panelRight,
      rights: [cut, finished].map((span) => span?.markEnd),
      unknown: unknown?.markEnd,
    }).toStrictEqual({
      clear: true,
      cut: [true, true, true],
      finishedShorter: true,
      inside: true,
      rights: [short?.markEnd, short?.markEnd],
      unknown: Number.NEGATIVE_INFINITY,
    });
  });

  it("draws nothing after the name while a rider's interval is unknown", () => {
    const rows = fieldOf(0, [0, 1]).map((row, at) =>
      at === 1 ? { ...row, mark: "blank" as const } : row
    );
    expect(textsOf(rows)).toStrictEqual(["1 RIDER 1 LEAD", "2 RIDER 2"]);
  });
});

describe("the timing tower's names", () => {
  it("has a name slot for every racer a field can hold", () => {
    const names = new Map<RiderId, string>(
      Array.from({ length: MOST_RACERS }, (_, at) => [
        riderIdAt(at),
        `Rider ${at}`,
      ])
    );
    expect(planFor(names, placementFor(wideView, "all", 2)).used).toBeLessThan(
      1024
    );
  });
});
