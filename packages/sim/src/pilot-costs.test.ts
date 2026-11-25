import type { Track } from "@racer/track/track";
import { NO_CROSSING } from "@racer/track/walk-sites";
import { describe, expect, it } from "vitest";

import {
  effectsOf,
  frameOf,
  placedAt,
  player,
  roadWith,
  straight,
} from "./race-fixtures.ts";
import { createRace, defaultSetup, stepRace } from "./race.ts";
import { TICK_RATE } from "./state.ts";
import type { RaceEvent, RaceState } from "./state.ts";

const HAZARD_S = 1000;
const LANE_X = 1.8;
const DODGED_X = 3.23;

const pothole = roadWith(placedAt("pothole", HAZARD_S, LANE_X, "pit"));

const onStraight: Track = {
  ...straight,
  walkSites: [
    { crossing: NO_CROSSING, id: "walker", kind: "jaywalk", s: HAZARD_S },
  ],
};

const skilledPilot = (road: Track): RaceState => {
  const setup = defaultSetup(road, 1);
  return createRace({
    ...setup,
    player: { ...setup.player, controller: "pilot", skill: 1 },
    police: { ...setup.police, count: 0 },
    rivals: [],
  });
};

const rideAt = (
  state: RaceState,
  road: Track,
  from: number,
  x: number,
  speed: number,
  until: number
) => {
  const rider = player(state);
  rider.s = from;
  rider.bodyS = from;
  rider.x = x;
  rider.bodyX = x;
  rider.speed = speed;
  const events: RaceEvent[] = [];
  const lines: number[] = [];
  let slowest = speed;
  for (let tick = 0; tick < 5 * TICK_RATE && rider.s < until; tick += 1) {
    stepRace(state, road, frameOf(state));
    events.push(...state.events);
    slowest = Math.min(slowest, rider.speed);
    if (Number.isFinite(rider.pilotLine)) {
      lines.push(rider.pilotLine);
    }
  }
  return { effects: effectsOf(events), lines, slowest };
};

describe("the costs the pilot weighs a line by", () => {
  it("ride round a pothole on its line instead of through it", () => {
    const run = rideAt(
      skilledPilot(pothole),
      pothole,
      HAZARD_S - 100,
      LANE_X,
      35,
      HAZARD_S + 30
    );
    expect(run.effects).toStrictEqual([]);
  });

  it("hold the line it dodged to until just past the pothole, though its own lane soon costs a little less", () => {
    const run = rideAt(
      skilledPilot(pothole),
      pothole,
      HAZARD_S - 100,
      LANE_X,
      35,
      HAZARD_S + 30
    );
    expect(run.lines.length).toBeGreaterThan(0);
    expect(
      run.lines.filter((line) => Math.abs(line - DODGED_X) > 0.01)
    ).toStrictEqual([]);
  });

  it("steer round a walker crossing its lane at speed rather than give way to them", () => {
    const state = skilledPilot(onStraight);
    const [walker] = state.pedestrians;
    if (!walker) {
      throw new Error("The road has no walker.");
    }
    const metres = 90;
    const speed = 35;
    const drift = 1.4;
    walker.drift = drift;
    walker.mode = "walking";
    walker.wait = 0;
    walker.x = 2 - (drift * metres) / speed;
    const run = rideAt(
      state,
      onStraight,
      HAZARD_S - metres,
      2,
      speed,
      HAZARD_S + 5
    );
    expect(run.effects).toStrictEqual([]);
    expect(run.slowest).toBeGreaterThan(speed - 1);
  });
});
