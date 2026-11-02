import { coasting } from "@racer/sim/control";
import type { RaceRun } from "@racer/sim/race-run";
import type { RaceView } from "@racer/sim/race-view";
import { TICK_SECONDS } from "@racer/sim/state";
import type { RiderId } from "@racer/sim/state";

import type { RoomSeat, SeatRace } from "./seat-client.ts";

export interface RoomRun extends RaceRun {
  readonly me: RiderId;
  readonly confirmed: RaceView;
  readonly countdownSeconds: () => number;
  readonly leave: () => void;
  readonly listen: (onConfirmed: (view: RaceView) => void) => void;
  readonly stepsDue: () => number;
}

export const createRoomRun = (seat: RoomSeat, race: SeatRace): RoomRun => {
  const { client, me } = race;
  return {
    confirmed: client.confirmed,
    countdownSeconds: () => (1 - seat.target()) * TICK_SECONDS,
    leave: seat.leave,
    listen: (onConfirmed) => {
      seat.listen({
        onConfirmed: (latest) => {
          onConfirmed(latest.confirmed);
        },
      });
    },
    me,
    step: (frame) => {
      client.predict(frame.controls.get(me) ?? coasting);
      seat.flush();
    },
    stepsDue: seat.stepsDue,
    view: client.predicted,
  };
};
