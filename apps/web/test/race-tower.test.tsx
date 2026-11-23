import type { HeapProfiler } from "node:inspector";
import { Session as Inspector } from "node:inspector/promises";

import { recordedRules } from "@racer/career/bench";
import { createRaceLog } from "@racer/career/outcome";
import { celebritySuits } from "@racer/sim/cast";
import { riderBlocks, riderPalette } from "@racer/sim/palette";
import { createRace, standings, stepRace } from "@racer/sim/race";
import type { RaceRun } from "@racer/sim/race-run";
import { PLAYER_RIDER, TICK_RATE, riderOf } from "@racer/sim/state";
import type { InputFrame, RaceState, RiderState } from "@racer/sim/state";
import { createRaceTiming } from "@racer/sim/timing";
import { renderToStaticMarkup } from "react-dom/server";
import * as THREE from "three";
import { describe, expect, it } from "vitest";

import { firstQuickPick, planFor, quickEntry } from "../src/career/flow.ts";
import { ROW_EM } from "../src/components/screens/hud-layout.ts";
import { RaceTower } from "../src/components/screens/race-tower.tsx";
import { undressed } from "../src/game/figure-wardrobe.ts";
import type { Dressing } from "../src/game/figure-wardrobe.ts";
import { countdownFor, racingFrom } from "../src/game/game-session.ts";
import type { Session } from "../src/game/game-session.ts";
import { createTower } from "../src/game/hud-tower.ts";
import type { RacePlan, TowerRow } from "../src/game/hud.ts";
import { roomRunStub } from "./room-run-stub.ts";

const SEED = 11;
const noControls: InputFrame = { controls: new Map(), handovers: new Map() };

const soloPlan: RacePlan = planFor(
  recordedRules,
  null,
  quickEntry(firstQuickPick, SEED)
);

const roomPlan: RacePlan = {
  ...soloPlan,
  room: roomRunStub(soloPlan.setup, "tower-room"),
};

interface Ride {
  readonly state: RaceState;
  readonly session: Session;
  readonly stage: {
    readonly colours: ReadonlyMap<RiderState["id"], number>;
    readonly me: RiderState["id"];
    readonly race: RaceRun;
  };
}

const rideFor = (plan: RacePlan, seconds: number): Ride => {
  const { setup } = plan;
  const state = createRace({
    ...setup,
    player: { ...setup.player, controller: "pilot" },
  });
  const timing = createRaceTiming(state, setup.track.length);
  const race: RaceRun = {
    events: () => state.events,
    step: (frame) => {
      stepRace(state, setup.track, frame);
      timing.record(state);
    },
    takeCorrections: () => [],
    takeFights: () => [],
    timing,
    view: state,
  };
  for (let tick = 0; tick < seconds * TICK_RATE; tick += 1) {
    race.step(noControls);
  }
  return {
    session: racingFrom(countdownFor(plan, createRaceLog(setup), undressed)),
    stage: { colours: new Map(), me: PLAYER_RIDER, race },
    state,
  };
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

const hex = (colour: number): string =>
  `#${colour.toString(16).padStart(6, "0")}`;

const paintedBody = {
  atlas: null,
  bones: [],
  poses: new Map(),
  primitives: [],
  scene: new THREE.Object3D(),
  seat: new THREE.Vector3(),
  standHeight: 0,
};

const WARM_READS = 20_000;
const SAMPLED_WINDOWS = 3;
const SAMPLED_READS = 10_000;

const bytesIn = (
  node: HeapProfiler.SamplingHeapProfileNode,
  file: string
): number =>
  (node.callFrame.url.includes(file) ? node.selfSize : 0) +
  node.children.reduce((sum, child) => sum + bytesIn(child, file), 0);

interface Sampled {
  readonly bytes: number;
  readonly same: boolean;
}

const sampledIn = async (
  file: string,
  work: () => boolean
): Promise<Sampled> => {
  const inspector = new Inspector();
  inspector.connect();
  await inspector.post("HeapProfiler.enable");
  await inspector.post("HeapProfiler.startSampling", {
    includeObjectsCollectedByMajorGC: true,
    includeObjectsCollectedByMinorGC: true,
    samplingInterval: 16,
  });
  const same = work();
  const { profile } = await inspector.post("HeapProfiler.stopSampling");
  inspector.disconnect();
  return { bytes: bytesIn(profile.head, file), same };
};

const windowsIn = async (
  count: number,
  file: string,
  work: () => boolean
): Promise<readonly Sampled[]> =>
  count === 0
    ? []
    : [
        await sampledIn(file, work),
        ...(await windowsIn(count - 1, file, work)),
      ];

const markupOf = (rows: readonly TowerRow[]): string =>
  renderToStaticMarkup(<RaceTower rows={rows} shown="all" />);

describe("the race tower", () => {
  it("lists every racer in the order the place tag reads, and no cop", () => {
    const ride = rideFor(soloPlan, 30);
    const rows = rowsOf(createTower(), ride);
    const racers = ride.state.riders.filter(
      (rider) => rider.profile.role === "racer"
    );
    expect(ride.state.riders.length).toBeGreaterThan(racers.length);
    expect(rows.map((row) => row.id)).toStrictEqual(standings(ride.state));
    expect(rows).toHaveLength(racers.length);
    expect(rows.map((row) => row.place)).toStrictEqual(
      rows.map((_, at) => at + 1)
    );
  });

  it("marks the leader, gives every other rider a gap and names the player You", () => {
    const rows = rowsOf(createTower(), rideFor(soloPlan, 30));
    expect(rows[0]?.mark).toBe("lead");
    expect(rows.slice(1).map((row) => row.mark)).toStrictEqual(
      rows.slice(1).map(() => "gap")
    );
    expect(rows.filter((row) => row.you).map((row) => row.name)).toStrictEqual([
      "You",
    ]);
  });

  it("shows a wrecked, a busted and a finished rider at a glance", () => {
    const ride = rideFor(soloPlan, 30);
    const tower = createTower();
    const [finished, wrecked, busted] = [2, 3, 4].map((place) =>
      riderAtPlace(ride.state, place)
    );
    if (!finished || !wrecked || !busted) {
      throw new Error("The race has fewer than four racers.");
    }
    finished.finishTick = ride.state.tick - 30;
    wrecked.mode = "wrecked";
    busted.mode = "busted";
    const rows = rowsOf(tower, ride);
    const markup = markupOf(rows);
    expect(rows.filter((row) => row.finished)).toHaveLength(1);
    expect(
      rows
        .slice(-2)
        .map((row) => row.mark)
        .toSorted()
    ).toStrictEqual(["busted", "wrecked"]);
    expect(
      ["Wrecked", "Busted", 'aria-label="Finished"', ">Lead<"].filter(
        (text) => !markup.includes(text)
      )
    ).toStrictEqual([]);
    expect(markup).toMatch(/>\+\d+\.\d</u);
    expect(markup).not.toMatch(/[—·]/u);
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
    const chipOf = (rider: RiderState) =>
      rows.find((row) => row.id === rider.id)?.chip;
    expect([painted, blocked, plain].map(chipOf)).toStrictEqual([
      hex(celebritySuits.ronaldo),
      hex(riderBlocks[0]?.suit ?? -1),
      hex(riderPalette[plain.profile.jacket]?.jacket ?? -1),
    ]);
  });

  it("draws a dropped room rider like any other rider", () => {
    const ride = rideFor(roomPlan, 30);
    const tower = createTower();
    const rival = riderAtPlace(ride.state, 2);
    rival.controller = "human";
    const seated = markupOf(rowsOf(tower, ride));
    rival.controller = "pilot";
    expect(markupOf(rowsOf(createTower(), ride))).toBe(seated);
  });

  it("publishes an unchanged tower without building a row, an array or an argument", async () => {
    const ride = rideFor(soloPlan, 30);
    const tower = createTower();
    const order = standings(ride.state);
    const first = tower.read(ride.session, ride.stage, order);
    for (let read = 0; read < WARM_READS; read += 1) {
      tower.read(ride.session, ride.stage, order);
    }
    const readUnchanged = (): boolean => {
      let same = true;
      for (let read = 0; read < SAMPLED_READS; read += 1) {
        same &&= tower.read(ride.session, ride.stage, order) === first;
      }
      return same;
    };
    const windows = await windowsIn(
      SAMPLED_WINDOWS,
      "hud-tower.ts",
      readUnchanged
    );
    const built = Math.min(...windows.map((window) => window.bytes));
    const unchanged = windows.every((window) => window.same);
    expect({ built, unchanged }).toStrictEqual({ built: 0, unchanged: true });
  });

  it("slides a row to its new place by its top, so no compositor animation runs over the race", () => {
    const rows = rowsOf(createTower(), rideFor(soloPlan, 30));
    const markup = markupOf(rows);
    const rowStyles = [...markup.matchAll(/<li class="[^"]*" style="([^"]*)"/gu)].map(
      (match) => match[1]
    );
    const motion = [...markup.matchAll(/class="([^"]*)"/gu)]
      .flatMap((match) => match[1]?.split(" ") ?? [])
      .filter(
        (name) =>
          name.startsWith("transition") ||
          name.startsWith("animate-") ||
          name.startsWith("will-change")
      );
    expect(rowStyles).toStrictEqual(
      rows.map((_, slot) => `height:${ROW_EM}em;top:${slot * ROW_EM}em`)
    );
    expect(new Set(motion)).toStrictEqual(new Set(["transition-[top]"]));
  });

  it("hands React the same rows while nothing it shows has changed", () => {
    const ride = rideFor(soloPlan, 30);
    const tower = createTower();
    const first = rowsOf(tower, ride);
    expect(rowsOf(tower, ride)).toBe(first);
    for (let tick = 0; tick < TICK_RATE; tick += 1) {
      ride.stage.race.step(noControls);
    }
    expect(rowsOf(tower, ride)).not.toBe(first);
  });
});
