import type { GuestColours, GuestNames } from "@racer/career/room-race";
import { coasting } from "@racer/sim/control";
import type { RaceRun } from "@racer/sim/race-run";
import type { RaceView } from "@racer/sim/race-view";
import { TICK_SECONDS } from "@racer/sim/state";
import type { Control, RiderId } from "@racer/sim/state";

import type { InputLatency, LatencySummary } from "./input-latency.ts";
import type { RoomSeat, SeatRace } from "./seat-client.ts";

export interface RoomNet {
  readonly inputToFrame: LatencySummary;
  readonly resimulatedPerSecond: number;
  readonly rollbacks: number;
  readonly roundTripMs: number;
  readonly worstRoundTripMs: number;
}

export interface RoomReport {
  readonly colours: GuestColours;
  readonly myColour: number | undefined;
  readonly names: GuestNames;
  readonly net: RoomNet;
  readonly raceId: string;
  readonly roomId: string;
}

export interface RoomRun extends RaceRun {
  readonly awayMs: number | null;
  readonly holdSeconds: number;
  readonly me: RiderId;
  readonly roomId: string;
  readonly riderColours: ReadonlyMap<RiderId, number>;
  readonly confirmed: RaceView;
  readonly countdownSeconds: () => number;
  readonly frameDrawn: (ownOffMetres: number, rivalOffMetres: number) => void;
  readonly lagging: () => boolean;
  readonly leave: () => void;
  readonly listen: (onConfirmed: (view: RaceView) => void) => void;
  readonly report: () => RoomReport;
  readonly pace: () => number;
  readonly stepsDue: () => number;
}

export const createRoomRun = (
  seat: RoomSeat,
  race: SeatRace,
  roomId: string,
  latency: InputLatency
): RoomRun => {
  const {
    awayMs,
    client,
    colours,
    holdSeconds,
    me,
    names,
    raceId,
    riderColours,
  } = race;
  let sent: Control = coasting;
  let appliesAt = 0;
  return {
    awayMs,
    confirmed: client.confirmed,
    countdownSeconds: () => (1 - seat.target()) * TICK_SECONDS,
    events: client.takeEvents,
    frameDrawn: seat.frameDrawn,
    holdSeconds,
    lagging: () => client.lagging() || seat.leadBloated(),
    leave: seat.leave,
    listen: (onConfirmed) => {
      seat.listen({
        onConfirmed: (latest) => {
          onConfirmed(latest.confirmed);
        },
      });
    },
    me,
    pace: seat.pace,
    report: () => {
      client.settle();
      return {
        colours,
        myColour: riderColours.get(me),
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
        raceId,
        roomId,
      };
    },
    riderColours,
    roomId,
    step: (frame) => {
      const control = frame.controls.get(me) ?? coasting;
      const changed = control !== sent;
      if (changed) {
        sent = control;
        latency.controlChanged();
      }
      client.predict(control, seat.inputDelay());
      if (changed) {
        appliesAt = client.plannedThrough();
      }
      if (client.predicted.tick >= appliesAt) {
        latency.controlApplied();
      }
      seat.flush();
    },
    stepsDue: seat.stepsDue,
    takeCorrections: client.takeCorrections,
    takeFights: client.takeFights,
    view: client.predicted,
  };
};
