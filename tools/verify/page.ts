import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { setTimeout as sleep } from "node:timers/promises";

import {
  summariseTrace,
  threadNames,
  traceEvent,
} from "@racer/devtools/analysis";
import type { TraceEvent, TraceSummary } from "@racer/devtools/analysis";
import { connect, evaluate } from "@racer/devtools/cdp";
import type { CommandParams, Session } from "@racer/devtools/cdp";
import { pageTarget } from "@racer/devtools/chrome";
import * as Option from "effect/Option";
import * as Schema from "effect/Schema";

import type { InstanceState } from "./instance.ts";

const POLL_MS = 100;
const SCREENCAST_QUALITY = 70;
const SCREENCAST_WIDTH = 1512;
const SCREENCAST_HEIGHT = 860;
const TOP_THREADS = 10;

export const readySignals = new Map([
  ["held", "globalThis.__rushlineHeld === true"],
  [
    "race",
    "document.querySelector('[role=meter][aria-label=\"Speed\"]') !== null",
  ],
  [
    "title",
    "document.querySelector('[role=menu][aria-label=\"Title menu\"]') !== null",
  ],
]);

export const expressionFor = (signal: string): string =>
  readySignals.get(signal) ?? signal;

export const attach = async (state: InstanceState): Promise<Session> => {
  const { origin } = new URL(state.serverUrl);
  const socket =
    (await pageTarget(state.devtoolsPort, origin)) ??
    (await pageTarget(state.devtoolsPort, "http"));
  if (socket === undefined || socket === "") {
    throw new Error(
      `No page in the run's browser on DevTools port ${state.devtoolsPort}. Run rv doctor.`
    );
  }
  return await connect(socket);
};

export const waitFor = async (
  page: Session,
  expression: string,
  deadline: number
): Promise<string> => {
  const value = await evaluate(
    page,
    `(() => { try { const v = (${expression}); return v ? JSON.stringify(v) : ""; } catch { return ""; } })()`,
    Schema.String
  );
  if (value !== "") {
    return value;
  }
  if (Date.now() > deadline) {
    throw new Error(`Timed out waiting for ${expression}`);
  }
  await sleep(POLL_MS);
  return await waitFor(page, expression, deadline);
};

export const navigate = async (
  page: Session,
  url: string,
  deadline: number
): Promise<void> => {
  await evaluate(
    page,
    'Reflect.set(globalThis, "__rvLeaving", true)',
    Schema.Boolean
  );
  await page.send("Page.navigate", { url });
  await waitFor(
    page,
    `globalThis.__rvLeaving !== true && document.readyState === "complete" && location.href === ${JSON.stringify(url)}`,
    deadline
  );
};

interface KeySpec {
  readonly key: string;
  readonly keyCode: number;
  readonly text: string;
  readonly location: number;
}

const namedKeys = new Map<string, KeySpec>([
  ["ArrowDown", { key: "ArrowDown", keyCode: 40, location: 0, text: "" }],
  ["ArrowLeft", { key: "ArrowLeft", keyCode: 37, location: 0, text: "" }],
  ["ArrowRight", { key: "ArrowRight", keyCode: 39, location: 0, text: "" }],
  ["ArrowUp", { key: "ArrowUp", keyCode: 38, location: 0, text: "" }],
  ["Enter", { key: "Enter", keyCode: 13, location: 0, text: "\r" }],
  ["Escape", { key: "Escape", keyCode: 27, location: 0, text: "" }],
  ["ShiftLeft", { key: "Shift", keyCode: 16, location: 1, text: "" }],
  ["ShiftRight", { key: "Shift", keyCode: 16, location: 2, text: "" }],
  ["Space", { key: " ", keyCode: 32, location: 0, text: " " }],
  ["Tab", { key: "Tab", keyCode: 9, location: 0, text: "" }],
]);

export const keyOf = (code: string): KeySpec => {
  const named = namedKeys.get(code);
  if (named) {
    return named;
  }
  const letter = /^Key(?<letter>[A-Z])$/u.exec(code)?.groups?.letter;
  if (letter !== undefined) {
    return {
      key: letter.toLowerCase(),
      keyCode: letter.codePointAt(0) ?? 0,
      location: 0,
      text: letter.toLowerCase(),
    };
  }
  const digit = /^Digit(?<digit>\d)$/u.exec(code)?.groups?.digit;
  if (digit !== undefined) {
    return {
      key: digit,
      keyCode: digit.codePointAt(0) ?? 0,
      location: 0,
      text: digit,
    };
  }
  throw new Error(
    `Unknown key code ${code}. Use KeyboardEvent.code names: ArrowUp, KeyJ, Space, ShiftLeft, Escape.`
  );
};

const keyDown = (code: string, spec: KeySpec): CommandParams => {
  const common = {
    code,
    key: spec.key,
    location: spec.location,
    nativeVirtualKeyCode: spec.keyCode,
    windowsVirtualKeyCode: spec.keyCode,
  };
  return spec.text === ""
    ? { ...common, type: "rawKeyDown" }
    : {
        ...common,
        text: spec.text,
        type: "keyDown",
        unmodifiedText: spec.text,
      };
};

const keyUp = (code: string, spec: KeySpec): CommandParams => ({
  code,
  key: spec.key,
  location: spec.location,
  nativeVirtualKeyCode: spec.keyCode,
  type: "keyUp",
  windowsVirtualKeyCode: spec.keyCode,
});

export const press = async (
  page: Session,
  codes: readonly string[],
  holdMs: number
): Promise<void> => {
  const specs = codes.map((code) => [code, keyOf(code)] as const);
  await Promise.all(
    specs.map(async ([code, spec]) => {
      await page.send("Input.dispatchKeyEvent", keyDown(code, spec));
    })
  );
  await sleep(holdMs);
  await Promise.all(
    specs.map(async ([code, spec]) => {
      await page.send("Input.dispatchKeyEvent", keyUp(code, spec));
    })
  );
};

const clickTarget = Schema.Struct({
  error: Schema.optionalKey(Schema.String),
  label: Schema.optionalKey(Schema.String),
  seen: Schema.optionalKey(Schema.Array(Schema.String)),
  x: Schema.optionalKey(Schema.Number),
  y: Schema.optionalKey(Schema.Number),
});

const findControl = (text: string, within: string): string => `(() => {
  const want = ${JSON.stringify(text.toLowerCase())};
  const within = ${JSON.stringify(within)};
  const scope = within === "" ? document : document.querySelector('[aria-label="' + CSS.escape(within) + '"]');
  if (!scope) return { error: "nothing labelled " + within + " is on screen" };
  const lines = (el) => (el.innerText || el.getAttribute("aria-label") || "").split("\\n").map((l) => l.trim().toLowerCase()).filter((l) => l !== "" && l !== "▸");
  const shown = [...scope.querySelectorAll("button, [role=menuitem], [role=button], a[href]")].filter((el) => {
    const box = el.getBoundingClientRect();
    return box.width > 0 && box.height > 0 && !el.closest("[inert]");
  });
  const found = shown.find((el) => lines(el)[0] === want) ?? shown.find((el) => lines(el).includes(want));
  if (!found) return { error: "no visible control reads " + want, seen: shown.map((el) => lines(el).join(" / ")) };
  if (found.disabled || found.getAttribute("aria-disabled") === "true") return { error: want + " is disabled", seen: [lines(found).join(" / ")] };
  const box = found.getBoundingClientRect();
  const x = box.left + box.width / 2;
  const y = box.top + box.height / 2;
  const top = document.elementFromPoint(x, y);
  if (!(top && (top === found || found.contains(top)))) return { error: want + " is covered by " + (top ? top.outerHTML.slice(0, 160) : "nothing") };
  return { label: lines(found).join(" / "), x, y };
})()`;

export const click = async (
  page: Session,
  text: string,
  within: string
): Promise<string> => {
  const target = await evaluate(page, findControl(text, within), clickTarget);
  if (target.error !== undefined || target.x === undefined) {
    const seen =
      target.seen !== undefined && target.seen.length > 0
        ? `; on screen: ${target.seen.join(" | ")}`
        : "";
    throw new Error(`${target.error ?? "no target"}${seen}`);
  }
  const at = { x: target.x, y: target.y ?? 0 };
  await page.send("Input.dispatchMouseEvent", { ...at, type: "mouseMoved" });
  await page.send("Input.dispatchMouseEvent", {
    ...at,
    button: "left",
    buttons: 1,
    clickCount: 1,
    type: "mousePressed",
  });
  await page.send("Input.dispatchMouseEvent", {
    ...at,
    button: "left",
    buttons: 0,
    clickCount: 1,
    type: "mouseReleased",
  });
  return target.label ?? text;
};

const captured = Schema.Struct({ data: Schema.String });

export const screenshot = async (
  page: Session,
  file: string
): Promise<string> => {
  const { data } = await page.call(
    "Page.captureScreenshot",
    { format: "png" },
    captured
  );
  await writeFile(file, data, { encoding: "base64" });
  return file;
};

const axValue = Schema.optionalKey(
  Schema.Struct({ value: Schema.optionalKey(Schema.Unknown) })
);

const axTree = Schema.Struct({
  nodes: Schema.Array(
    Schema.Struct({
      childIds: Schema.optionalKey(Schema.Array(Schema.String)),
      ignored: Schema.Boolean,
      name: axValue,
      nodeId: Schema.String,
      properties: Schema.optionalKey(
        Schema.Array(
          Schema.Struct({
            name: Schema.String,
            value: Schema.Struct({ value: Schema.optionalKey(Schema.Unknown) }),
          })
        )
      ),
      role: axValue,
      value: axValue,
    })
  ),
});

type AxNode = (typeof axTree.Type)["nodes"][number];

const isText = Schema.is(Schema.String);

const axText = (field: AxNode["role"]): string => {
  const value = field?.value;
  return isText(value) ? value : "";
};

const QUIET_ROLES = new Set([
  "generic",
  "none",
  "InlineTextBox",
  "LineBreak",
  "RootWebArea",
]);

const STATE_PROPERTIES = new Set([
  "disabled",
  "pressed",
  "focused",
  "selected",
  "valuenow",
  "modal",
]);

const describeNode = (node: AxNode): string => {
  const role = axText(node.role);
  const name = axText(node.name).trim();
  const flags = (node.properties ?? [])
    .filter(
      (each) =>
        STATE_PROPERTIES.has(each.name) &&
        each.value.value !== false &&
        each.value.value !== undefined
    )
    .map((each) =>
      each.value.value === true
        ? each.name
        : `${each.name}=${String(each.value.value)}`
    );
  return [role, name === "" ? "" : JSON.stringify(name), ...flags]
    .filter(Boolean)
    .join(" ");
};

export const ariaSnapshot = async (
  page: Session,
  file: string
): Promise<number> => {
  await page.send("Accessibility.enable");
  const { nodes } = await page.call("Accessibility.getFullAXTree", {}, axTree);
  const byId = new Map(nodes.map((node) => [node.nodeId, node]));
  const lines: string[] = [];
  const walk = (node: AxNode, depth: number, named: string) => {
    const role = axText(node.role);
    const name = axText(node.name).trim();
    const repeated = role === "StaticText" && named.includes(name);
    const shown = !(node.ignored || QUIET_ROLES.has(role) || repeated);
    if (shown) {
      lines.push(`${"  ".repeat(depth)}${describeNode(node)}`);
    }
    for (const child of node.childIds ?? []) {
      const next = byId.get(child);
      if (next) {
        walk(next, shown ? depth + 1 : depth, name === "" ? named : name);
      }
    }
  };
  const [root] = nodes;
  if (root) {
    walk(root, 0, "");
  }
  await writeFile(file, `${lines.join("\n")}\n`);
  return lines.length;
};

const screencastFrame = Schema.Struct({
  data: Schema.String,
  metadata: Schema.Struct({ timestamp: Schema.optionalKey(Schema.Number) }),
  sessionId: Schema.Number,
});

export interface Screencast {
  readonly frames: number;
  readonly seconds: number;
  readonly dir: string;
}

export const screencast = async (
  page: Session,
  dir: string,
  seconds: number,
  everyNth: number
): Promise<Screencast> => {
  await mkdir(dir, { recursive: true });
  const writes: Promise<void>[] = [];
  const stamps: number[] = [];
  page.on("Page.screencastFrame", screencastFrame, (frame) => {
    const index = stamps.length;
    stamps.push(frame.metadata.timestamp ?? 0);
    writes.push(
      writeFile(
        path.join(dir, `frame-${String(index).padStart(4, "0")}.jpg`),
        frame.data,
        { encoding: "base64" }
      )
    );
    void page.send("Page.screencastFrameAck", { sessionId: frame.sessionId });
  });
  await page.send("Page.enable");
  await page.send("Page.startScreencast", {
    everyNthFrame: everyNth,
    format: "jpeg",
    maxHeight: SCREENCAST_HEIGHT,
    maxWidth: SCREENCAST_WIDTH,
    quality: SCREENCAST_QUALITY,
  });
  await sleep(seconds * 1000);
  await page.send("Page.stopScreencast");
  await Promise.all(writes);
  await writeFile(
    path.join(dir, "frames.json"),
    JSON.stringify({ everyNth, seconds, timestamps: stamps }, null, 1)
  );
  return { dir, frames: stamps.length, seconds };
};

export const TRACE_CATEGORIES = [
  "devtools.timeline",
  "disabled-by-default-devtools.timeline",
  "disabled-by-default-devtools.timeline.frame",
  "toplevel",
  "blink.user_timing",
  "v8.execute",
  "gpu",
  "disabled-by-default-gpu.service",
  "viz",
] as const;

const collectedChunk = Schema.Struct({ value: Schema.Array(Schema.Unknown) });

export interface ThreadLoad {
  readonly thread: string;
  readonly busyMs: number;
}

export interface TraceResult {
  readonly file: string;
  readonly events: number;
  readonly summary: TraceSummary;
  readonly threads: readonly ThreadLoad[];
}

const busiestThreads = (events: readonly TraceEvent[]): ThreadLoad[] => {
  const names = threadNames(events);
  const covered = new Map<string, { until: number; busy: number }>();
  const complete = events
    .filter((event) => event.ph === "X")
    .toSorted((a, b) => a.ts - b.ts);
  for (const event of complete) {
    const key = `${event.pid}:${event.tid}`;
    const seen = covered.get(key) ?? {
      busy: 0,
      until: Number.NEGATIVE_INFINITY,
    };
    const end = event.ts + (event.dur ?? 0);
    if (event.ts >= seen.until) {
      covered.set(key, { busy: seen.busy + (event.dur ?? 0), until: end });
    }
  }
  return [...covered.entries()]
    .map(([key, load]) => ({
      busyMs: load.busy / 1000,
      thread: names.get(key) ?? key,
    }))
    .toSorted((a, b) => b.busyMs - a.busyMs)
    .slice(0, TOP_THREADS);
};

const decodeEvent = Schema.decodeUnknownOption(traceEvent);

export const trace = async (
  page: Session,
  file: string,
  seconds: number
): Promise<TraceResult> => {
  const raw: unknown[] = [];
  page.on("Tracing.dataCollected", collectedChunk, ({ value }) => {
    raw.push(...value);
  });
  const { promise: complete, resolve } = Promise.withResolvers<boolean>();
  page.on("Tracing.tracingComplete", Schema.Unknown, () => {
    resolve(true);
  });
  await page.send("Tracing.start", {
    traceConfig: { includedCategories: [...TRACE_CATEGORIES] },
    transferMode: "ReportEvents",
  });
  await sleep(seconds * 1000);
  await page.send("Tracing.end");
  await complete;
  await writeFile(file, JSON.stringify({ traceEvents: raw }));
  const events = raw.flatMap((each) => Option.toArray(decodeEvent(each)));
  return {
    events: raw.length,
    file,
    summary: summariseTrace(events),
    threads: busiestThreads(events),
  };
};

const profileInfo = Schema.Struct({
  gpuTimer: Schema.Boolean,
  parts: Schema.Array(Schema.String),
  renderer: Schema.String,
  tick: Schema.Number,
});

const frameSample = Schema.Struct({
  calls: Schema.Array(Schema.Number),
  cpu: Schema.Array(Schema.Number),
  interval: Schema.Number,
  pixelRatio: Schema.Number,
  rung: Schema.Number,
  tick: Schema.Number,
});

export interface Stats {
  readonly mean: number;
  readonly p50: number;
  readonly p95: number;
  readonly p99: number;
  readonly max: number;
}

const statsOf = (values: readonly number[]): Stats => {
  const sorted = values.toSorted((a, b) => a - b);
  const at = (share: number) =>
    sorted[Math.min(sorted.length - 1, Math.floor(share * sorted.length))] ?? 0;
  return {
    max: sorted.at(-1) ?? 0,
    mean:
      sorted.length > 0
        ? sorted.reduce((sum, each) => sum + each, 0) / sorted.length
        : 0,
    p50: at(0.5),
    p95: at(0.95),
    p99: at(0.99),
  };
};

const LATE_MS = [20, 33] as const;

export interface Sample {
  readonly renderer: string;
  readonly fromTick: number;
  readonly toTick: number;
  readonly frames: number;
  readonly fps: number;
  readonly interval: Stats;
  readonly jsFrame: Stats;
  readonly calls: number;
  readonly late: Readonly<Record<string, number>>;
  readonly pixelRatios: readonly number[];
  readonly rungs: readonly number[];
}

export const sample = async (
  page: Session,
  seconds: number
): Promise<Sample> => {
  const read =
    "globalThis.__rushlineProfile ? globalThis.__rushlineProfile.info() : null";
  const before = await evaluate(page, read, Schema.NullOr(profileInfo));
  if (!before) {
    throw new Error(
      "The page has no frame recorder. Open it with &prof (or ?stress) and sample again."
    );
  }
  await sleep(seconds * 1000);
  const after = await evaluate(page, read, profileInfo);
  const frames = await evaluate(
    page,
    `globalThis.__rushlineProfile.window(${before.tick + 1}, ${after.tick})`,
    Schema.Array(frameSample)
  );
  const interval = statsOf(frames.map((frame) => frame.interval));
  return {
    calls: statsOf(
      frames.map((frame) => frame.calls.reduce((sum, each) => sum + each, 0))
    ).mean,
    fps: interval.mean > 0 ? 1000 / interval.mean : 0,
    frames: frames.length,
    fromTick: before.tick + 1,
    interval,
    jsFrame: statsOf(
      frames.map((frame) => frame.cpu.reduce((sum, each) => sum + each, 0))
    ),
    late: Object.fromEntries(
      LATE_MS.map((limit) => [
        `over${limit}ms`,
        frames.filter((frame) => frame.interval > limit).length,
      ])
    ),
    pixelRatios: [...new Set(frames.map((frame) => frame.pixelRatio))],
    renderer: after.renderer,
    rungs: [...new Set(frames.map((frame) => frame.rung))],
    toTick: after.tick,
  };
};

export interface NetworkProfile {
  readonly latency: number;
  readonly downloadThroughput: number;
  readonly uploadThroughput: number;
}

const MEGABIT = 125_000;

export const networkProfiles = new Map<string, NetworkProfile>([
  [
    "3g",
    {
      downloadThroughput: 1.6 * MEGABIT,
      latency: 300,
      uploadThroughput: 0.75 * MEGABIT,
    },
  ],
  [
    "fast4g",
    {
      downloadThroughput: 9 * MEGABIT,
      latency: 60,
      uploadThroughput: 1.5 * MEGABIT,
    },
  ],
  [
    "slow4g",
    {
      downloadThroughput: 3 * MEGABIT,
      latency: 150,
      uploadThroughput: 1.5 * MEGABIT,
    },
  ],
]);

export const throttle = async (
  page: Session,
  cpu: number,
  network: string
): Promise<void> => {
  await page.send("Emulation.setCPUThrottlingRate", { rate: cpu });
  const profile = networkProfiles.get(network);
  if (!profile) {
    return;
  }
  await page.send("Network.enable");
  await page.send("Network.emulateNetworkConditions", {
    downloadThroughput: profile.downloadThroughput,
    latency: profile.latency,
    offline: false,
    uploadThroughput: profile.uploadThroughput,
  });
};
