import { WAKE_GAP_CEILINGS_MS } from "@racer/rooms/notes";
import type {
  RaceCountdown,
  RaceEnded,
  RaceLeft,
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
  ended?: RaceEnded;
  readonly left: RaceLeft[];
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
  const fresh: RaceRecord = { browsers: [], left: [], raceId, stats: [] };
  records.set(raceId, fresh);
  return fresh;
};

export const groupRaces = (
  notes: readonly RoomNote[]
): readonly RaceRecord[] => {
  const records = new Map<string, RaceRecord>();
  for (const note of notes) {
    switch (note.kind) {
      case "refused":
      case "tapeLost": {
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
    ? `Race ${raceId} on ${started.road}, ${new Date(started.at).toISOString()}, build ${started.build.slice(0, 12)}, ${started.seats} human(s), seed ${started.seed}`
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
  `    desyncs ${stat(note, "desyncs")}, rollbacks ${stat(note, "rollbacks")}, refused predictions ${stat(note, "refusedPredictions")}`,
];

const browserIdentity = ({ build, gpu, graphics }: RaceBrowserNote): string =>
  `    browser: build ${build.slice(0, 12)}, ${gpu}, ${graphics}`;

const seatLines = (
  seat: RaceSeat,
  stats: readonly RaceStatsNote[],
  browsers: readonly RaceBrowserNote[]
): readonly string[] => {
  const report = stats.find((note) => note.rider === seat.rider);
  const browser = browsers.find((note) => note.rider === seat.rider);
  return [
    `  Rider ${seat.rider}: ${outcomeOf(seat)}, ${seat.colo ?? "unknown colo"} at ${seat.tcpRttMs ?? "?"} ms, ready after ${seat.readyMs === null ? "never" : seconds(seat.readyMs)}, road ${seat.roadMetres} m`,
    `    server: ${seat.crashes} crashes, controls ${seat.accepted} accepted, ${seat.missed} missed, ${seat.late} late, ${seat.ahead} ahead`,
    ...(browser ? [browserIdentity(browser)] : []),
    ...(report ? browserLines(report) : ["    browser: no stats line arrived"]),
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
  return `  Server: worst ${ended.worstBehindTicks} ticks behind, ${ended.catchUpWakes} catch-up wakes. Gaps between wakes, ${gaps}.`;
};

const unfinishedLines = (record: RaceRecord): readonly string[] => [
  "  No ended line: the room died, or the race is still running.",
  ...record.left.map(
    ({ tally, tick }) =>
      `  Rider ${tally.rider} left at ${raceTime(tick)}, controls ${tally.accepted} accepted, ${tally.missed} missed`
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
    countdown ? `loading ${seconds(countdown.waitedMs)}` : null,
    countdown && countdown.stillLoading.length > 0
      ? `started without rider(s) ${countdown.stillLoading.join(", ")}`
      : null,
    ended ? `raced ${raceTime(ended.tick)}` : null,
    ended
      ? `browser stats from ${stats.length} of ${ended.seats.length} riders`
      : null,
  ];
  return `  ${parts.filter((part) => part !== null).join(", ")}`;
};

export const raceReport = (record: RaceRecord): string =>
  [
    headline(record),
    timelineLine(record),
    ...(record.ended
      ? [
          serverLine(record.ended),
          ...record.ended.seats.flatMap((seat) =>
            seatLines(seat, record.stats, record.browsers)
          ),
        ]
      : unfinishedLines(record)),
  ].join("\n");
