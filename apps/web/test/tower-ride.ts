import { recordedRules } from "@racer/career/bench";
import { createRaceLog } from "@racer/career/outcome";
import { createRace, stepRace } from "@racer/sim/race";
import type { RaceRun } from "@racer/sim/race-run";
import { PLAYER_RIDER, TICK_RATE } from "@racer/sim/state";
import type { InputFrame, RaceState, RiderState } from "@racer/sim/state";
import { createRaceTiming } from "@racer/sim/timing";

import { firstQuickPick, planFor, quickEntry } from "../src/career/flow.ts";
import { undressed } from "../src/game/figure-wardrobe.ts";
import { countdownFor, racingFrom } from "../src/game/game-session.ts";
import type { Session } from "../src/game/game-session.ts";
import type { RacePlan } from "../src/game/hud.ts";

const SEED = 11;
export const noControls: InputFrame = {
  controls: new Map(),
  handovers: new Map(),
};

export const soloPlan: RacePlan = planFor(
  recordedRules,
  null,
  quickEntry(firstQuickPick, SEED)
);

export interface Ride {
  readonly state: RaceState;
  readonly session: Session;
  readonly stage: {
    readonly colours: ReadonlyMap<RiderState["id"], number>;
    readonly me: RiderState["id"];
    readonly race: RaceRun;
  };
}

export const rideFor = (plan: RacePlan, seconds: number): Ride => {
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
