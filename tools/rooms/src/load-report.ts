import type { RoomStatus } from "@racer/rooms/contract";
import { TICK_SECONDS } from "@racer/sim/state";

import type { ClientResult } from "./load-plan.ts";
import { otherCoresBetween } from "./machine.ts";
import type { ProcessTable } from "./machine.ts";

const TICK_MS = TICK_SECONDS * 1000;
const TICKS_PER_SECOND = 60;
const LEAST_TICK_SHARE = 0.98;
const MOST_CATCH_UP_SHARE = 0.01;
const MOST_GAP_P99_MS = 34;
const MOST_MISSED_SHARE = 0.02;
const MOST_OTHER_CORES = 3;
const MOST_CLIENT_LOOP_P99_MS = 25;

export interface Sample {
  readonly at: number;
  readonly processes: ProcessTable;
  readonly statuses: readonly RoomStatus[];
}

export interface StepFacts {
  readonly clients: readonly ClientResult[];
  readonly first: Sample;
  readonly inputHz: number;
  readonly loadBefore: number;
  readonly loadAfter: number;
  readonly mostLoad: number;
  readonly raceAt: number;
  readonly rideSeconds: number;
  readonly rooms: number;
  readonly seats: number;
  readonly second: Sample;
  readonly server: number | null;
}

const sumOf = (values: readonly number[]): number =>
  values.reduce((total, value) => total + value, 0);

const gapQuantiles = (clients: readonly ClientResult[]) => {
  const counts = new Map<number, number>();
  for (const [gap, count] of clients.flatMap((client) => client.gaps)) {
    counts.set(gap, (counts.get(gap) ?? 0) + count);
  }
  const sorted = [...counts].toSorted(([left], [right]) => left - right);
  const total = sumOf(sorted.map(([, count]) => count));
  const at = (share: number): number => {
    let seen = 0;
    for (const [gap, count] of sorted) {
      seen += count;
      if (seen >= total * share) {
        return gap;
      }
    }
    return 0;
  };
  return { maxMs: sorted.at(-1)?.[0] ?? 0, p50Ms: at(0.5), p99Ms: at(0.99) };
};

const serverOf = (facts: StepFacts, ticks: number, seconds: number) => {
  const { first, second, server } = facts;
  const before = server === null ? undefined : first.processes.get(server);
  const after = server === null ? undefined : second.processes.get(server);
  if (!before || !after) {
    return null;
  }
  const cpuSeconds = after.cpuSeconds - before.cpuSeconds;
  return {
    cores: cpuSeconds / seconds,
    cpuMsPerRoomTick: (cpuSeconds * 1000) / Math.max(1, ticks),
    cpuSeconds,
    rssMb: after.rssMb,
  };
};

const deadlineProblems = (values: {
  readonly catchUpShare: number;
  readonly gapP99Ms: number;
  readonly lost: number;
  readonly missedShare: number;
  readonly refused: number;
  readonly tickShare: number;
}): readonly string[] => [
  ...(values.tickShare < LEAST_TICK_SHARE
    ? [`A room stepped ${values.tickShare.toFixed(3)} of its ticks.`]
    : []),
  ...(values.catchUpShare > MOST_CATCH_UP_SHARE
    ? [`${(values.catchUpShare * 100).toFixed(1)}% of wakes were catch-ups.`]
    : []),
  ...(values.gapP99Ms > MOST_GAP_P99_MS
    ? [`Tick gaps reached ${values.gapP99Ms} ms at p99.`]
    : []),
  ...(values.missedShare > MOST_MISSED_SHARE
    ? [`A seat missed ${(values.missedShare * 100).toFixed(1)}% of its ticks.`]
    : []),
  ...(values.lost > 0 ? [`${values.lost} seats lost their socket.`] : []),
  ...(values.refused > 0 ? [`${values.refused} seats were refused.`] : []),
];

const fullSeatProblems = (clients: readonly ClientResult[]) =>
  clients
    .flatMap((client) => client.full)
    .flatMap((seat) =>
      seat.desyncs > 0 || !seat.digestMatched
        ? [`A predicting seat desynced ${seat.desyncs} times.`]
        : []
    );

const machineProblems = (
  facts: StepFacts,
  otherCores: number,
  clientLoopP99Ms: number
): readonly string[] => [
  ...(facts.loadBefore > facts.mostLoad
    ? [`Load average was ${facts.loadBefore.toFixed(1)} at the start.`]
    : []),
  ...(facts.loadAfter > facts.mostLoad
    ? [`Load average was ${facts.loadAfter.toFixed(1)} at the end.`]
    : []),
  ...(otherCores > MOST_OTHER_CORES
    ? [`Other processes used ${otherCores.toFixed(1)} cores.`]
    : []),
  ...(clientLoopP99Ms > MOST_CLIENT_LOOP_P99_MS
    ? [`A client's event loop lagged ${clientLoopP99Ms.toFixed(0)} ms at p99.`]
    : []),
];

export const stepReport = (facts: StepFacts) => {
  const { clients, first, second } = facts;
  const seconds = (second.at - first.at) / 1000;
  const pairs = second.statuses.map((status, room) => ({
    after: status,
    before: first.statuses[room] ?? status,
  }));
  const ticks = sumOf(
    pairs.map(({ after, before }) => after.tick - before.tick)
  );
  const wakes = sumOf(
    pairs.map(({ after, before }) => after.wakes - before.wakes)
  );
  const catchUps = sumOf(
    pairs.map(({ after, before }) => after.catchUpWakes - before.catchUpWakes)
  );
  const tickShare = Math.min(
    ...pairs.map(
      ({ after, before }) =>
        (after.tick - before.tick) / (seconds * TICKS_PER_SECOND)
    )
  );
  const behindAtEnd = Math.max(
    ...second.statuses.map(
      (status) => Math.floor((second.at - facts.raceAt) / TICK_MS) - status.tick
    )
  );
  const missedShare = Math.max(
    0,
    ...second.statuses.flatMap((status) =>
      status.seats.map((seat) => seat.missed / Math.max(1, status.tick))
    )
  );
  const gaps = gapQuantiles(clients);
  const clientLoopP99Ms = Math.max(
    ...clients.map((client) => client.loopP99Ms)
  );
  const lost = sumOf(clients.map((client) => client.lost));
  const refused = sumOf(clients.map((client) => client.refused));
  const otherCores = otherCoresBetween(
    first.processes,
    second.processes,
    seconds,
    facts.server
  );
  const full = clients.flatMap((client) => client.full);
  const capped = clients.some((client) => client.capped);
  const sent = sumOf(clients.map((client) => client.sent));
  const problems = [
    ...deadlineProblems({
      catchUpShare: catchUps / Math.max(1, wakes),
      gapP99Ms: gaps.p99Ms,
      lost,
      missedShare,
      refused,
      tickShare,
    }),
    ...fullSeatProblems(clients),
  ];
  const notCounted = [
    ...machineProblems(facts, otherCores, clientLoopP99Ms),
    ...(capped ? ["The message cap ended this step."] : []),
  ];
  return {
    capped,
    catchUpShare: catchUps / Math.max(1, wakes),
    clientLoopP99Ms,
    counted: notCounted.length === 0,
    full,
    gaps,
    held: problems.length === 0,
    inputHz: facts.inputHz,
    loadAfter: facts.loadAfter,
    loadBefore: facts.loadBefore,
    messagesSent: sent,
    messagesSentPerSeatSecond:
      sent / (facts.rooms * facts.seats) / facts.rideSeconds,
    missedShare,
    notCounted,
    otherCores,
    problems,
    roomTicksPerSecond: ticks / seconds,
    rooms: facts.rooms,
    seats: facts.seats,
    seconds,
    server: serverOf(facts, ticks, seconds),
    tickShare,
    ticksBehindAtEnd: behindAtEnd,
    worstBehindTicks: Math.max(
      ...second.statuses.map((status) => status.worstBehindTicks)
    ),
    worstRttMs: Math.max(...clients.map((client) => client.worstRttMs)),
  };
};

export type StepReport = ReturnType<typeof stepReport>;
