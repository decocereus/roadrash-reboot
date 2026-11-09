import { WAKE_GAP_CEILINGS_MS } from "@racer/rooms/notes";
import type {
  RaceCountdown,
  RaceEnded,
  RaceHeld,
  RaceLeft,
  RaceLost,
  RaceRejoined,
  RaceRestored,
  RaceSeat,
  RaceStarted,
  RaceBrowserNote,
  RaceStatsNote,
  RoomNote,
} from "@racer/rooms/notes";
import { TICK_SECONDS } from "@racer/sim/state";

const MS_PER_SECOND = 1000;
const SECONDS_PER_MINUTE = 60;

interface RaceRecord {
  readonly raceId: string;
  readonly browsers: RaceBrowserNote[];
  countdown?: RaceCountdown;
  readonly drops: (RaceHeld | RaceRejoined)[];
  ended?: RaceEnded;
  readonly left: RaceLeft[];
  readonly restarts: (RaceRestored | RaceLost)[];
  started?: RaceStarted;
  readonly stats: RaceStatsNote[];
}

const recordOf = (
  records: Map<string, RaceRecord>,
  raceId: string
): RaceRecord => {
  const known = records.get(raceId);
  if (known) {
    return known;
  }
  const fresh: RaceRecord = {
    browsers: [],
    drops: [],
    left: [],
    raceId,
    restarts: [],
    stats: [],
  };
  records.set(raceId, fresh);
  return fresh;
};

export const groupRaces = (
  notes: readonly RoomNote[]
): readonly RaceRecord[] => {
  const records = new Map<string, RaceRecord>();
  for (const note of notes) {
    switch (note.kind) {
      case "memoryLost":
      case "placed":
      case "refused":
      case "tapeLost": {
        break;
      }
      case "lost":
      case "restored": {
        recordOf(records, note.raceId).restarts.push(note);
        break;
      }
      case "started": {
        recordOf(records, note.raceId).started = note;
        break;
      }
      case "countdown": {
        recordOf(records, note.raceId).countdown = note;
        break;
      }
      case "held":
      case "rejoined": {
        recordOf(records, note.raceId).drops.push(note);
        break;
      }
      case "left": {
        recordOf(records, note.raceId).left.push(note);
        break;
      }
      case "stats": {
        recordOf(records, note.raceId).stats.push(note);
        break;
      }
      case "browser": {
        recordOf(records, note.raceId).browsers.push(note);
        break;
      }
      case "ended": {
        recordOf(records, note.raceId).ended = note;
        break;
      }
      default: {
        note satisfies never;
      }
    }
  }
  return [...records.values()].toSorted(
    (left, right) => (left.started?.at ?? 0) - (right.started?.at ?? 0)
  );
};

const seconds = (ms: number): string => `${(ms / MS_PER_SECOND).toFixed(1)} s`;

const raceTime = (ticks: number): string => {
  const total = Math.round(ticks * TICK_SECONDS);
  const minutes = Math.floor(total / SECONDS_PER_MINUTE);
  return `${minutes}:${String(total % SECONDS_PER_MINUTE).padStart(2, "0")}`;
};

const headline = ({ raceId, started }: RaceRecord): string =>
  started
    ? `Race ${raceId} on ${started.road}, ${new Date(started.at).toISOString()}, build ${started.build.slice(0, 12)}, ${started.seats} human(s), seed ${started.seed}, room in ${started.roomColo ?? "an unknown place"}`
    : `Race ${raceId}, its started line is missing`;

const outcomeOf = ({ finishTick, leftAtTick, mode }: RaceSeat): string => {
  const finished = finishTick >= 0;
  if (leftAtTick === null || (finished && finishTick <= leftAtTick)) {
    return finished ? `finished at ${raceTime(finishTick)}` : mode;
  }
  const pilot = finished
    ? `, the pilot finished at ${raceTime(finishTick)}`
    : "";
  return `left at ${raceTime(leftAtTick)}${pilot}`;
};

const stat = (note: RaceStatsNote, field: string): number =>
  note.stats[field] ?? 0;

const browserLines = (note: RaceStatsNote): readonly string[] => [
  `    crashes ${stat(note, "crashes")}, ${stat(note, "crashesAfterCorrection")} after a correction`,
  `    clock: held steps ${stat(note, "heldSteps")}, multi-steps ${stat(note, "doubledSteps")}, most in one frame ${stat(note, "mostSteps")}`,
  `    worst jump: own control ${stat(note, "worstOwnControlCm")} cm, behind the server ${stat(note, "worstBehindServerCm")} cm, other riders ${stat(note, "worstOtherRidersCm")} cm, at ${stat(note, "worstJumpRoadMetres")} m`,
  `    round trip: mean ${stat(note, "rttMeanMs")} ms, worst ${stat(note, "rttWorstMs")} ms`,
  `    frame times: ${stat(note, "frameCount")} frames, p50 ${stat(note, "frameP50Ms")} ms, p95 ${stat(note, "frameP95Ms")} ms, p99 ${stat(note, "frameP99Ms")} ms`,
  `    frames: slowest ${stat(note, "worstFrameMs")} ms at ${stat(note, "worstFrameRoadMetres")} m, ${stat(note, "slowFrames")} slow`,
  `    desyncs ${stat(note, "desyncs")}, rollbacks ${stat(note, "rollbacks")}, refused predictions ${stat(note, "refusedPredictions")}, retried presses ${stat(note, "retriedPresses")}`,
];

const browserIdentity = ({ build, gpu, graphics }: RaceBrowserNote): string =>
  `    browser: build ${build.slice(0, 12)}, ${gpu}, ${graphics}`;

const seatLines = (
  seat: RaceSeat,
  stats: readonly RaceStatsNote[],
  browsers: readonly RaceBrowserNote[]
): readonly string[] => {
  const reports = stats.filter((note) => note.rider === seat.rider);
  const identities = browsers.filter((note) => note.rider === seat.rider);
  const connections = reports.flatMap((report, at) => [
    ...(reports.length > 1 ? [`    connection ${at + 1}:`] : []),
    ...browserLines(report),
  ]);
  return [
    `  Rider ${seat.rider}: ${outcomeOf(seat)}, ${seat.colo ?? "unknown colo"} at ${seat.tcpRttMs ?? "?"} ms on ${seat.network ?? "an unknown network"}, ready after ${seat.readyMs === null ? "never" : seconds(seat.readyMs)}, road ${seat.roadMetres} m`,
    `    server: ${seat.crashes} crashes, controls ${seat.accepted} accepted, ${seat.missed} missed, ${seat.late} late, ${seat.ahead} ahead`,
    ...identities.map(browserIdentity),
    ...(connections.length > 0
      ? connections
      : ["    browser: no stats line arrived"]),
  ];
};

const gapLabels = [
  ...WAKE_GAP_CEILINGS_MS.map((ceiling) => `up to ${ceiling} ms`),
  `over ${WAKE_GAP_CEILINGS_MS.at(-1) ?? 0} ms`,
];

const serverLine = (ended: RaceEnded): string => {
  const gaps = ended.wakeGaps
    .map((count, at) => `${gapLabels[at] ?? ""}: ${count}`)
    .join(", ");
  const dropped =
    ended.dropped !== null && ended.dropped > 0
      ? ` Dropped ${ended.dropped} messages over a socket's budget.`
      : "";
  return `  Server: worst ${ended.worstBehindTicks} ticks behind, ${ended.catchUpWakes} catch-up wakes. Gaps between wakes, ${gaps}.${dropped}`;
};

const restartLine = (note: RaceRestored | RaceLost): string => {
  switch (note.kind) {
    case "restored": {
      return `  The room restarted after ${seconds(note.afterMs)} and the race went on from ${raceTime(note.tick)}, checkpointed on build ${note.build.slice(0, 12)}`;
    }
    case "lost": {
      return `  The room restarted after ${seconds(note.afterMs)} and lost the race at ${raceTime(note.tick)}, no result`;
    }
    default: {
      return note satisfies never;
    }
  }
};

const unfinishedLines = (record: RaceRecord): readonly string[] => [
  record.restarts.some((note) => note.kind === "lost")
    ? "  No ended line: the room lost this race in a restart."
    : "  No ended line: the room died, or the race is still running.",
  ...record.left.map(
    ({ closeCode, tally, tick }) =>
      `  Rider ${tally.rider} left at ${raceTime(tick)}, socket closed ${closeCode ?? "with no code"}, controls ${tally.accepted} accepted, ${tally.missed} missed`
  ),
  ...record.stats.flatMap((note) => [
    `  Rider ${note.rider}, from the browser:`,
    ...browserLines(note),
  ]),
];

const timelineLine = ({
  countdown,
  ended,
  started,
  stats,
}: RaceRecord): string => {
  const parts = [
    started ? `lobby ${seconds(started.lobbyMs)}` : null,
    countdown ? `waited for riders ${seconds(countdown.waitedMs)}` : null,
    countdown && countdown.stillLoading.length > 0
      ? `started without rider(s) ${countdown.stillLoading.join(", ")}`
      : null,
    ended ? `raced ${raceTime(ended.tick)}` : null,
    ended
      ? `browser stats from ${new Set(stats.map(({ rider }) => rider)).size} of ${ended.seats.length} riders`
      : null,
  ];
  return `  ${parts.filter((part) => part !== null).join(", ")}`;
};

const dropLine = (note: RaceHeld | RaceRejoined): string => {
  switch (note.kind) {
    case "held": {
      return `  Rider ${note.rider} lost the link at ${raceTime(note.tick)}, socket closed ${note.closeCode ?? "with no code"}, bike held`;
    }
    case "rejoined": {
      return `  Rider ${note.rider} came back after ${seconds(note.awayMs)} and caught up ${note.catchUpTicks} ticks`;
    }
    default: {
      return note satisfies never;
    }
  }
};

export const raceReport = (record: RaceRecord): string =>
  [
    headline(record),
    timelineLine(record),
    ...record.restarts.map(restartLine),
    ...record.drops.map(dropLine),
    ...(record.ended
      ? [
          serverLine(record.ended),
          ...record.ended.seats.flatMap((seat) =>
            seatLines(seat, record.stats, record.browsers)
          ),
        ]
      : unfinishedLines(record)),
  ].join("\n");
