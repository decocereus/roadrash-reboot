import type { RoomRun } from "@racer/rooms/room-run";
import { createRaceRun } from "@racer/sim/race-run";
import { PLAYER_RIDER } from "@racer/sim/state";
import type { RaceSetup } from "@racer/sim/state";

const never = (what: string) => (): never => {
  throw new Error(`The test never ${what}.`);
};

export const roomRunStub = (
  setup: RaceSetup,
  roomId: string,
  countdownSeconds: () => number = () => 3
): RoomRun => {
  const { step, view } = createRaceRun(setup);
  return {
    awayMs: null,
    confirmed: view,
    countdownSeconds,
    events: () => [],
    frameDrawn: never("draws"),
    holdSeconds: 30,
    lagging: () => false,
    leave: never("leaves a room"),
    listen: never("listens"),
    me: PLAYER_RIDER,
    pace: () => 1,
    pressed: never("hears a key"),
    report: never("reports"),
    reportNow: never("reports"),
    riderColours: new Map(),
    roomId,
    stallLeftMs: () => null,
    step,
    stepsDue: () => 1,
    stoppedDrawing: never("draws"),
    takeCorrections: () => [],
    takeFights: () => [],
    view,
  };
};
