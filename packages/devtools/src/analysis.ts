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

const CallFrame = Schema.Struct({
  columnNumber: Schema.Number,
  functionName: Schema.String,
  lineNumber: Schema.Number,
  url: Schema.String,
});

export const cpuProfile = Schema.Struct({
  profile: Schema.Struct({
    nodes: Schema.Array(
      Schema.Struct({ callFrame: CallFrame, id: Schema.Number })
    ),
    samples: Schema.Array(Schema.Number),
    timeDeltas: Schema.Array(Schema.Number),
  }),
});

export type CpuProfile = typeof cpuProfile.Type;

const sourceMap = Schema.Struct({
  mappings: Schema.String,
  names: Schema.Array(Schema.String),
  sources: Schema.Array(Schema.String),
  sourcesContent: Schema.optionalKey(
    Schema.Array(Schema.NullOr(Schema.String))
  ),
});

type SourceMap = typeof sourceMap.Type;

const BASE64 =
  "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";
const VLQ_BASE = 32;

const decodeVlq = (text: string): number[] => {
  const values: number[] = [];
  let value = 0;
  let scale = 1;
  for (const char of text) {
    const digit = BASE64.indexOf(char);
    value += (digit % VLQ_BASE) * scale;
    if (digit >= VLQ_BASE) {
      scale *= VLQ_BASE;
    } else {
      const magnitude = Math.floor(value / 2);
      values.push(value % 2 === 1 ? -magnitude : magnitude);
      value = 0;
      scale = 1;
    }
  }
  return values;
};

interface Segment {
  readonly column: number;
  readonly source: number;
  readonly line: number;
  readonly sourceColumn: number;
  readonly name: number;
}

const segmentsOf = (map: SourceMap): Segment[][] => {
  const state = { line: 0, name: 0, source: 0, sourceColumn: 0 };
  return map.mappings.split(";").map((line) => {
    let column = 0;
    return line
      .split(",")
      .filter((piece) => piece.length > 0)
      .map((piece) => {
        const [dColumn = 0, dSource = 0, dLine = 0, dSourceColumn = 0, dName] =
          decodeVlq(piece);
        column += dColumn;
        state.source += dSource;
        state.line += dLine;
        state.sourceColumn += dSourceColumn;
        if (dName !== undefined) {
          state.name += dName;
        }
        return {
          column,
          line: state.line,
          name: dName === undefined ? -1 : state.name,
          source: state.source,
          sourceColumn: state.sourceColumn,
        };
      });
  });
};

interface LoadedMap {
  readonly map: SourceMap;
  readonly lines: Segment[][];
}

const loadMap = async (url: string): Promise<LoadedMap | null> => {
  try {
    const response = await fetch(`${url}.map`);
    if (!response.ok) {
      return null;
    }
    const map = Schema.decodeUnknownSync(sourceMap)(await response.json());
    return { lines: segmentsOf(map), map };
  } catch {
    return null;
  }
};

const originalOf = (
  loaded: LoadedMap,
  line: number,
  column: number
): string | null => {
  const segments = loaded.lines[line] ?? [];
  const found = segments.findLast((segment) => segment.column <= column);
  if (!found) {
    return null;
  }
  const source = (loaded.map.sources[found.source] ?? "?")
    .replace(/^(?:\.\.\/)+/u, "")
    .replace(/^node_modules\/\.pnpm\/[^/]+\/node_modules\//u, "");
  const lines = loaded.map.sourcesContent?.[found.source]?.split("\n") ?? [];
  const text = lines[found.line]?.trim() ?? "";
  const name = loaded.map.names[found.name];
  return `${source}:${found.line + 1}${name !== undefined && name !== "" ? ` ${name}` : ""}  ${text.slice(0, 70)}`;
};

interface HotFunction {
  readonly selfMs: number;
  readonly share: number;
  readonly name: string;
  readonly where: string;
}

const IDLE = new Set(["(idle)", "(program)", "(root)"]);

export interface Hotspots {
  readonly busyMs: number;
  readonly idleMs: number;
  readonly programMs: number;
  readonly top: HotFunction[];
}

export const hottest = async (
  profile: CpuProfile,
  limit: number
): Promise<Hotspots> => {
  const byNode = new Map(profile.profile.nodes.map((node) => [node.id, node]));
  const selfByKey = new Map<string, number>();
  const frameByKey = new Map<string, typeof CallFrame.Type>();
  const special = new Map<string, number>();
  for (const [index, sample] of profile.profile.samples.entries()) {
    const node = byNode.get(sample);
    if (!node) {
      continue;
    }
    if (IDLE.has(node.callFrame.functionName)) {
      const { functionName } = node.callFrame;
      const micros = profile.profile.timeDeltas[index] ?? 0;
      special.set(
        functionName,
        (special.get(functionName) ?? 0) + micros / 1000
      );
      continue;
    }
    const { functionName, url, lineNumber, columnNumber } = node.callFrame;
    const key = `${functionName}|${url}|${lineNumber}|${columnNumber}`;
    const micros = profile.profile.timeDeltas[index] ?? 0;
    selfByKey.set(key, (selfByKey.get(key) ?? 0) + micros / 1000);
    frameByKey.set(key, node.callFrame);
  }
  const busyMs = [...selfByKey.values()].reduce((sum, each) => sum + each, 0);
  const ranked = [...selfByKey.entries()]
    .toSorted((a, b) => b[1] - a[1])
    .slice(0, limit);
  const urls = new Set(
    ranked.map(([key]) => frameByKey.get(key)?.url ?? "").filter(Boolean)
  );
  const maps = new Map(
    await Promise.all(
      [...urls].map(async (url) => [url, await loadMap(url)] as const)
    )
  );
  const top = ranked.map(([key, selfMs]) => {
    const frame = frameByKey.get(key);
    const loaded = frame ? maps.get(frame.url) : undefined;
    const original =
      frame && loaded
        ? originalOf(loaded, frame.lineNumber, frame.columnNumber)
        : null;
    const file = frame?.url.split("/").at(-1) ?? "";
    return {
      name:
        frame === undefined || frame.functionName === ""
          ? "(anonymous)"
          : frame.functionName,
      selfMs,
      share: busyMs > 0 ? selfMs / busyMs : 0,
      where: original ?? `${file}:${(frame?.lineNumber ?? 0) + 1}`,
    };
  });
  return {
    busyMs,
    idleMs: special.get("(idle)") ?? 0,
    programMs: special.get("(program)") ?? 0,
    top,
  };
};

interface AllocationNode {
  readonly callFrame: typeof CallFrame.Type;
  readonly selfSize: number;
  readonly children: readonly AllocationNode[];
}

const allocationNode = Schema.Struct({
  callFrame: CallFrame,
  children: Schema.Array(
    Schema.suspend((): Schema.Codec<AllocationNode> => allocationNode)
  ),
  selfSize: Schema.Number,
});

export const allocationProfile = Schema.Struct({
  profile: Schema.Struct({ head: allocationNode }),
});

export type AllocationProfile = typeof allocationProfile.Type;

interface AllocationSite {
  readonly bytes: number;
  readonly share: number;
  readonly name: string;
  readonly where: string;
}

export interface Allocations {
  readonly bytes: number;
  readonly top: readonly AllocationSite[];
}

interface SiteTotal {
  bytes: number;
  readonly frame: typeof CallFrame.Type;
}

const gatherAllocations = (
  node: AllocationNode,
  caller: typeof CallFrame.Type,
  into: Map<string, SiteTotal>
): void => {
  const builtin = node.callFrame.url === "";
  const frame = builtin
    ? {
        ...caller,
        functionName: `${node.callFrame.functionName} in ${caller.functionName || "(anonymous)"}`,
      }
    : node.callFrame;
  if (node.selfSize > 0) {
    const { functionName, url, lineNumber, columnNumber } = frame;
    const key = `${functionName}|${url}|${lineNumber}|${columnNumber}`;
    const site = into.get(key);
    if (site) {
      site.bytes += node.selfSize;
    } else {
      into.set(key, { bytes: node.selfSize, frame });
    }
  }
  for (const child of node.children) {
    gatherAllocations(child, builtin ? caller : node.callFrame, into);
  }
};

export const allocationSites = async (
  profile: AllocationProfile,
  limit: number
): Promise<Allocations> => {
  const sites = new Map<string, SiteTotal>();
  gatherAllocations(
    profile.profile.head,
    profile.profile.head.callFrame,
    sites
  );
  const bytes = [...sites.values()].reduce((sum, each) => sum + each.bytes, 0);
  const ranked = [...sites.values()]
    .toSorted((a, b) => b.bytes - a.bytes)
    .slice(0, limit);
  const urls = new Set(ranked.map(({ frame }) => frame.url).filter(Boolean));
  const maps = new Map(
    await Promise.all(
      [...urls].map(async (url) => [url, await loadMap(url)] as const)
    )
  );
  return {
    bytes,
    top: ranked.map((site) => {
      const { frame } = site;
      const loaded = maps.get(frame.url);
      const original = loaded
        ? originalOf(loaded, frame.lineNumber, frame.columnNumber)
        : null;
      return {
        bytes: site.bytes,
        name: frame.functionName || "(anonymous)",
        share: bytes > 0 ? site.bytes / bytes : 0,
        where:
          original ??
          `${frame.url.split("/").at(-1) ?? ""}:${frame.lineNumber + 1}`,
      };
    }),
  };
};
