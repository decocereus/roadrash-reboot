import { openRoomSeat, predictSteps } from "@racer/rooms/seat-client";
import type { RoomSeat } from "@racer/rooms/seat-client";
import { controlOf } from "@racer/sim/control";
import { TICK_SECONDS } from "@racer/sim/state";
import type { Control } from "@racer/sim/state";

const TICK_MS = TICK_SECONDS * 1000;
const STEER_PERIOD_TICKS = 37;

export interface SeatReport {
  readonly you: number;
  readonly digestMatched: boolean;
  readonly ticks: number;
  readonly hashesCompared: number;
  readonly desyncs: number;
  readonly rollbacks: number;
  readonly resimulatedTicks: number;
  readonly refusedPredictions: number;
  readonly rttMs: number;
  readonly arrivalGapP50Ms: number;
  readonly arrivalGapP99Ms: number;
  readonly arrivalGapMaxMs: number;
  readonly closeCode: number | null;
  readonly ended: boolean;
  readonly refused: string | null;
}

export interface Seat {
  readonly leave: () => void;
  readonly opened: () => boolean;
  readonly over: () => boolean;
  readonly report: () => SeatReport;
  readonly start: () => void;
  readonly started: () => boolean;
}

const quantile = (sorted: readonly number[], share: number): number =>
  sorted[Math.min(sorted.length - 1, Math.floor(sorted.length * share))] ?? 0;

const steerOf = (tick: number, rider: number): number => {
  const phase = (tick + rider * 11) % (STEER_PERIOD_TICKS * 2);
  return phase < STEER_PERIOD_TICKS ? 0.35 : -0.35;
};

export const weavingControl = (tick: number, rider: number): Control =>
  controlOf({
    brake: 0,
    kick: false,
    punch: tick % 241 === 0,
    steer: steerOf(tick, rider),
    throttle: 1,
  });

const pumpWeaving = (seat: RoomSeat, you: () => number): number =>
  predictSteps(seat, (tick) => weavingControl(tick, you()));

export const openSeat = (roomsUrl: string, raceId: string): Seat => {
  const seat = openRoomSeat(roomsUrl, raceId, "Script");
  const gaps: number[] = [];
  let lastArrival = 0;
  let hashesCompared = 0;
  let refusedPredictions = 0;
  let pump: ReturnType<typeof setInterval> | null = null;
  const stopPump = (): void => {
    if (pump) {
      clearInterval(pump);
      pump = null;
    }
  };
  const you = (): number => seat.race()?.me ?? -1;
  seat.listen({
    onChange: () => {
      const phase = seat.phase();
      if (phase === "loading") {
        seat.ready();
      } else if (phase === "racing" && !pump) {
        pump = setInterval(() => {
          refusedPredictions += pumpWeaving(seat, you);
        }, TICK_MS);
      } else if (phase !== "racing") {
        stopPump();
      }
    },
    onTickHeard: (now, hashed) => {
      if (lastArrival !== 0) {
        gaps.push(now - lastArrival);
      }
      lastArrival = now;
      hashesCompared += hashed ? 1 : 0;
    },
  });
  const over = (): boolean => {
    const phase = seat.phase();
    return (
      phase === "ended" ||
      phase === "left" ||
      phase === "lost" ||
      phase === "refused"
    );
  };
  return {
    leave: () => {
      stopPump();
      seat.leave();
    },
    opened: () => seat.phase() !== "connecting",
    over,
    report: () => {
      const sorted = gaps.toSorted((left, right) => left - right);
      const race = seat.race();
      return {
        arrivalGapMaxMs: sorted.at(-1) ?? 0,
        arrivalGapP50Ms: quantile(sorted, 0.5),
        arrivalGapP99Ms: quantile(sorted, 0.99),
        closeCode: seat.closeCode(),
        desyncs: race?.client.stats.desyncs ?? 0,
        digestMatched: race?.digestMatched ?? false,
        ended: seat.phase() === "ended",
        hashesCompared,
        refused: seat.refusal(),
        refusedPredictions,
        resimulatedTicks: race?.client.stats.resimulatedTicks ?? 0,
        rollbacks: race?.client.stats.rollbacks ?? 0,
        rttMs: seat.rttMs(),
        ticks: race?.client.confirmed.tick ?? 0,
        you: you(),
      };
    },
    start: seat.start,
    started: () => seat.race() !== null,
  };
};
