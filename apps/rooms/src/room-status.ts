import type { RoomRule } from "@racer/career/room-race";
import { TICK_SECONDS } from "@racer/sim/state";

import type { RoomStatus } from "./contract.ts";
import type { HostState } from "./host-phase.ts";
import type { Present } from "./present.ts";
import type { Run } from "./race-build.ts";
import { tallyOf } from "./race-seat.ts";

const TICK_MS = TICK_SECONDS * 1000;

export interface RoomCounters {
  readonly catchUpWakes: number;
  readonly dropped: number;
  readonly wakes: number;
  readonly worstBehindTicks: number;
}

export const roomStatus = (
  build: string,
  state: HostState<Run>,
  people: readonly Present[],
  rule: RoomRule,
  counters: RoomCounters,
  now: number
): RoomStatus => {
  const { phase, run } = state;
  return {
    ...counters,
    build,
    hostPhase: phase,
    lagTicks:
      state.phase === "racing"
        ? Math.max(
            0,
            Math.floor((now - state.startedAt) / TICK_MS) -
              state.run.room.state.tick
          )
        : 0,
    names: people.map((person) => person.name),
    phase: run ? "racing" : "waiting",
    raceId: run?.raceId ?? null,
    roles: people.map(({ role }) => role.kind),
    rule,
    seats: people.flatMap(({ role }) =>
      role.kind === "seated" ? [tallyOf(role.seat, role.run.room)] : []
    ),
    tick: run ? run.room.state.tick : 0,
    waiting: people.length,
  };
};
