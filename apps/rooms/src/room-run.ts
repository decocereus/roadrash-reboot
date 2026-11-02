import type { GuestNames } from "@racer/career/room-race";
import { coasting } from "@racer/sim/control";
import type { RaceRun } from "@racer/sim/race-run";
import type { RaceView } from "@racer/sim/race-view";
import { TICK_SECONDS } from "@racer/sim/state";
import type { Control, RiderId } from "@racer/sim/state";

import type { InputLatency, LatencySummary } from "./input-latency.ts";
import { rematchRoomId } from "./messages.ts";
import type { RoomSeat, SeatRace } from "./seat-client.ts";

export interface RoomNet {
  readonly inputToFrame: LatencySummary;
  readonly resimulatedPerSecond: number;
  readonly rollbacks: number;
  readonly roundTripMs: number;
  readonly worstRoundTripMs: number;
}

export interface RoomReport {
  readonly names: GuestNames;
  readonly net: RoomNet;
  readonly rematchId: string;
}

export interface RoomRun extends RaceRun {
  readonly me: RiderId;
  readonly confirmed: RaceView;
  readonly countdownSeconds: () => number;
  readonly leave: () => void;
  readonly listen: (onConfirmed: (view: RaceView) => void) => void;
  readonly report: () => RoomReport;
  readonly stepsDue: () => number;
}

export const createRoomRun = (
  seat: RoomSeat,
  race: SeatRace,
  raceId: string,
  latency: InputLatency
): RoomRun => {
  const { client, me, names } = race;
  let sent: Control = coasting;
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
    report: () => ({
      names,
      net: {
        inputToFrame: latency.summary(),
        resimulatedPerSecond:
          client.stats.resimulatedTicks /
          Math.max(1, client.confirmed.tick * TICK_SECONDS),
        rollbacks: client.stats.rollbacks,
        roundTripMs: seat.rttMs(),
        worstRoundTripMs: seat.worstRttMs(),
      },
      rematchId: rematchRoomId(raceId),
    }),
    step: (frame) => {
      const control = frame.controls.get(me) ?? coasting;
      if (control !== sent) {
        sent = control;
        latency.controlChanged();
      }
      client.predict(control);
      seat.flush();
    },
    stepsDue: seat.stepsDue,
    view: client.predicted,
  };
};
