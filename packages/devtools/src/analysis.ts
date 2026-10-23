import * as Schema from "effect/Schema";

export const traceEvent = Schema.Struct({
  args: Schema.optionalKey(
    Schema.Struct({
      data: Schema.optionalKey(Schema.Unknown),
      name: Schema.optionalKey(Schema.Unknown),
    })
  ),
  dur: Schema.optionalKey(Schema.Number),
  name: Schema.String,
  ph: Schema.String,
  pid: Schema.Number,
  tid: Schema.Number,
  ts: Schema.Number,
});

export type TraceEvent = typeof traceEvent.Type;

const isText = Schema.is(Schema.String);

const GC_NAMES = new Set(["MinorGC", "MajorGC"]);
const CLOCK_MARK = "rushline-clock";
const STALL_EVENT_MICROS = 1000;
const LONG_TASK_MS = 50;
const MAIN_THREAD = "CrRendererMain";

interface PauseSummary {
  readonly count: number;
  readonly totalMs: number;
  readonly maxMs: number;
}

export interface TraceSummary {
  readonly minorGc: PauseSummary;
  readonly majorGc: PauseSummary;
  readonly longTasks: PauseSummary;
  readonly longestTaskMs: number;
  readonly spanMs: number;
}

const pauses = (durations: readonly number[]): PauseSummary => ({
  count: durations.length,
  maxMs: Math.max(0, ...durations),
  totalMs: durations.reduce((sum, each) => sum + each, 0),
});

export const summariseTrace = (events: readonly TraceEvent[]): TraceSummary => {
  const mainThreads = new Set(
    events
      .filter(
        (event) =>
          event.name === "thread_name" && event.args?.name === MAIN_THREAD
      )
      .map((event) => `${event.pid}:${event.tid}`)
  );
  const onMain = events.filter(
    (event) => event.ph === "X" && mainThreads.has(`${event.pid}:${event.tid}`)
  );
  const millis = (name: string): number[] =>
    onMain
      .filter((event) => event.name === name)
      .map((event) => (event.dur ?? 0) / 1000);
  const outermost: number[] = [];
  let coveredUntil = Number.NEGATIVE_INFINITY;
  for (const event of onMain.toSorted((a, b) => a.ts - b.ts)) {
    const end = event.ts + (event.dur ?? 0);
    if (event.ts >= coveredUntil) {
      outermost.push((event.dur ?? 0) / 1000);
      coveredUntil = end;
    }
  }
  const stamps = onMain.map((event) => event.ts);
  return {
    longTasks: pauses(outermost.filter((each) => each > LONG_TASK_MS)),
    longestTaskMs: Math.max(0, ...outermost),
    majorGc: pauses(millis("MajorGC")),
    minorGc: pauses(millis("MinorGC")),
    spanMs:
      stamps.length > 0
        ? (Math.max(...stamps) - Math.min(...stamps)) / 1000
        : 0,
  };
};

const clockMarkData = Schema.Struct({ message: Schema.Literal(CLOCK_MARK) });
const isClockMarkData = Schema.is(clockMarkData);

export const clockMark = CLOCK_MARK;

export const clockMarkMicros = (events: readonly TraceEvent[]): number | null =>
  events.find(
    (event) => event.name === "TimeStamp" && isClockMarkData(event.args?.data)
  )?.ts ?? null;

export const threadNames = (
  events: readonly TraceEvent[]
): ReadonlyMap<string, string> => {
  const processes = new Map<number, string>();
  for (const event of events) {
    if (event.name === "process_name") {
      const name = event.args?.name;
      processes.set(event.pid, isText(name) ? name : String(event.pid));
    }
  }
  const threads = new Map<string, string>();
  for (const event of events) {
    if (event.name === "thread_name") {
      const name = event.args?.name;
      threads.set(
        `${event.pid}:${event.tid}`,
        `${processes.get(event.pid) ?? event.pid}/${isText(name) ? name : String(event.tid)}`
      );
    }
  }
  return threads;
};

export interface StallEvent {
  readonly thread: string;
  readonly name: string;
  readonly ms: number;
}

export const eventsDuring = (
  events: readonly TraceEvent[],
  threads: ReadonlyMap<string, string>,
  span: readonly [fromMicros: number, toMicros: number],
  limit: number
): StallEvent[] => {
  const [from, to] = span;
  const seen = new Set<string>();
  return events
    .filter(
      (event) =>
        event.ph === "X" &&
        (event.dur ?? 0) >= STALL_EVENT_MICROS &&
        event.ts < to &&
        event.ts + (event.dur ?? 0) > from
    )
    .toSorted((a, b) => (b.dur ?? 0) - (a.dur ?? 0))
    .map((event) => ({
      ms: (event.dur ?? 0) / 1000,
      name: event.name,
      thread:
        threads.get(`${event.pid}:${event.tid}`) ?? `${event.pid}:${event.tid}`,
    }))
    .filter((each) => {
      const key = `${each.thread}|${each.name}`;
      if (seen.has(key)) {
        return false;
      }
      seen.add(key);
      return true;
    })
    .slice(0, limit);
};

export const gcNamesSeen = (events: readonly TraceEvent[]): string[] => [
  ...new Set(
    events
      .map((event) => event.name)
      .filter((name) => GC_NAMES.has(name) || name.includes("GC"))
  ),
];
