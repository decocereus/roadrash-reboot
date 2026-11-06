import { PLAYER_EVENTS_ENDPOINT, shortSession } from "@racer/telemetry/limits";
import type {
  BatchKind,
  FaultSource,
  GraphicsPlace,
  TestDevice,
} from "@racer/telemetry/limits";
import type { Quality, Session, TelemetryEvent } from "@racer/telemetry/schema";

import type { ProfileFrame } from "../game/profile.ts";
import { createGraphicsLoss } from "./graphics-loss.ts";
import type { Drawing } from "./graphics-loss.ts";
import {
  browserFamilyOf,
  createPlayerEvents,
  graphicsCard,
  storedPlayerId,
} from "./player-events.ts";
import type { PlayerEvents } from "./player-events.ts";
import { createRecorder } from "./recorder.ts";
import type { Recorder } from "./recorder.ts";
import { createSettingsStore, storage } from "./settings.ts";
import type { Settings, SettingsStore } from "./settings.ts";
import type { UploadRuntime } from "./uploader-runtime.ts";
import { createUploader } from "./uploader.ts";
import type { ReportStatus, UploadQueue } from "./uploader.ts";

const FLUSH_MS = 30_000;
const USER_AGENT_LENGTH = 240;

interface GameSnapshot {
  readonly phase: string;
  readonly race: number;
  readonly tick: number;
  readonly quality: Quality;
}

interface GameProbe {
  readonly renderer: string;
  readonly snapshot: () => GameSnapshot;
  readonly frameAt: (frame: number) => ProfileFrame | null;
  readonly latestFrame: () => number;
}

export interface DiagnosticsView {
  readonly settings: Settings;
  readonly report: ReportStatus;
  readonly playerId: string;
  readonly queued: number;
  readonly session: string;
}

interface DiagnosticsSnapshot extends GameSnapshot {
  readonly recording: boolean;
  readonly contextLost: boolean;
  readonly queuedBatches: number;
  readonly droppedRecords: number;
}

interface DiagnosticsReader {
  readonly info: () => Session;
  readonly snapshot: () => DiagnosticsSnapshot | null;
  readonly frames: (afterFrame: number, limit: number) => ProfileFrame[];
  readonly events: (afterSeq: number, limit: number) => TelemetryEvent[];
  readonly flush: () => void;
  readonly playerEventsDropped: () => number;
}

export interface Diagnostics {
  readonly events: PlayerEvents;
  readonly settings: SettingsStore;
  readonly recorder: Recorder;
  readonly qualityRung: () => number;
  readonly attachGame: (probe: GameProbe) => () => void;
  readonly showing: (place: GraphicsPlace) => void;
  readonly watchCanvas: (
    canvas: HTMLCanvasElement,
    drawing: Drawing
  ) => () => void;
  readonly sendReport: () => void;
  readonly view: () => DiagnosticsView;
  readonly subscribe: (listener: () => void) => () => void;
}

export const sanitise = (text: string): string =>
  text
    .replaceAll(/(?<url>https?:\/\/[^\s?#)]*)[?#][^\s)]*/gu, "$<url>")
    .replaceAll(globalThis.location.origin, "")
    .replaceAll(/\s+/gu, " ")
    .trim();

const fileOf = (url: string): string => sanitise(url).split("/").at(-1) ?? "";

const messageOf = (reason: Error | string | number | boolean | null): string =>
  reason instanceof Error
    ? `${reason.name}: ${reason.message}`
    : String(reason);

const lazyDelivery = (): ((queue: UploadQueue) => void) => {
  let runtime: UploadRuntime | null = null;
  let loading = false;

  const load = async (queue: UploadQueue): Promise<void> => {
    loading = true;
    try {
      const loaded = await import("./uploader-runtime.ts");
      runtime = loaded.browserUploadRuntime();
      runtime.drain(queue);
    } catch {
      const entry = queue.next();
      if (entry !== undefined) {
        queue.settle(entry, { kind: "retry", reason: "collector unreachable" });
      }
    } finally {
      loading = false;
    }
  };

  return (queue) => {
    if (runtime !== null) {
      runtime.drain(queue);
    } else if (!loading) {
      void load(queue);
    }
  };
};

const createDiagnostics = (): Diagnostics => {
  const settings = createSettingsStore();
  const recorder = createRecorder();
  const uploader = createUploader(lazyDelivery());
  const sessionId = crypto.randomUUID();
  const startedAt = new Date().toISOString();
  const listeners = new Set<() => void>();
  let probe: GameProbe | null = null;
  let contextLost = false;
  let view: DiagnosticsView | null = null;
  let playerId: string | null = null;

  const player = (): string => {
    playerId ??= storedPlayerId(storage());
    return playerId;
  };

  const events = createPlayerEvents({
    after(ms, run) {
      setTimeout(run, ms);
    },
    build: __RUSHLINE_BUILD__.sha,
    enabled: () => settings.read().raceData,
    now: () => performance.now(),
    playerId: player,
    send: (body) =>
      navigator.sendBeacon(
        PLAYER_EVENTS_ENDPOINT,
        new Blob([body], { type: "application/json" })
      ),
  });
  let shown: GraphicsPlace = "menu";
  const graphicsLoss = createGraphicsLoss({
    after(ms, run) {
      const timer = setTimeout(run, ms);
      return () => {
        clearTimeout(timer);
      };
    },
    place: () => shown,
    track: events.track,
  });

  const notify = () => {
    view = null;
    for (const listener of listeners) {
      listener();
    }
  };

  const session = (device: TestDevice): Session => ({
    build: { dirty: __RUSHLINE_BUILD__.dirty, sha: __RUSHLINE_BUILD__.sha },
    device,
    pixelRatio: globalThis.devicePixelRatio,
    renderer: probe?.renderer ?? "",
    screenHeight: Math.round(globalThis.screen.height),
    screenWidth: Math.round(globalThis.screen.width),
    sessionId,
    startedAt,
    userAgent: navigator.userAgent.slice(0, USER_AGENT_LENGTH),
  });

  const enqueue = (kind: BatchKind, forced: boolean) => {
    const outgoing = recorder.flush(
      kind,
      session(settings.read().device),
      probe?.snapshot().quality ?? null,
      probe ? probe.frameAt : null,
      uploader.droppedBatches()
    );
    uploader.enqueue(outgoing, forced);
  };

  const flush = () => {
    if (recorder.recording && !recorder.quiet()) {
      enqueue("periodic", false);
      uploader.drain();
    }
  };

  const apply = () => {
    const current = settings.read();
    recorder.recording = current.recording;
    uploader.setAutomatic(current.automaticUpload);
    uploader.drain();
    notify();
  };

  const lost = () => {
    contextLost = true;
    recorder.context(true);
  };

  const restored = () => {
    contextLost = false;
    recorder.context(false);
  };

  const fault = (source: FaultSource, message: string, where: string) => {
    recorder.fault(source, sanitise(message), where);
  };

  window.addEventListener("error", (event: ErrorEvent) => {
    fault(
      "error",
      event.message,
      `${fileOf(event.filename)}:${event.lineno}:${event.colno}`
    );
  });
  window.addEventListener(
    "unhandledrejection",
    (event: PromiseRejectionEvent) => {
      fault(
        "rejection",
        messageOf(
          event.reason instanceof Error ? event.reason : String(event.reason)
        ),
        ""
      );
    }
  );
  document.addEventListener("visibilitychange", () => {
    recorder.visibility(document.hidden);
  });
  window.addEventListener("pagehide", () => {
    graphicsLoss.leaving();
    events.flush();
    if (recorder.recording) {
      enqueue("final", false);
      uploader.beacon();
    }
  });
  setInterval(flush, FLUSH_MS);
  settings.subscribe(apply);
  uploader.subscribe(notify);
  apply();
  if (settings.read().raceData) {
    events.track({
      browser: browserFamilyOf(navigator.userAgent),
      event: "game_opened",
      graphicsCard: graphicsCard(),
      pixelRatio: globalThis.devicePixelRatio,
      screenHeight: Math.round(globalThis.screen.height),
      screenWidth: Math.round(globalThis.screen.width),
    });
  }

  const reader: DiagnosticsReader = {
    events: recorder.events,
    flush,
    frames(afterFrame, limit) {
      const list: ProfileFrame[] = [];
      const latest = probe?.latestFrame() ?? -1;
      for (
        let frame = afterFrame + 1;
        frame <= latest && list.length < limit;
        frame += 1
      ) {
        const found = probe?.frameAt(frame) ?? null;
        if (found) {
          list.push(found);
        }
      }
      return list;
    },
    info: () => session(settings.read().device),
    playerEventsDropped: events.dropped,
    snapshot: () =>
      probe && {
        ...probe.snapshot(),
        contextLost,
        droppedRecords: recorder.droppedEvents(),
        queuedBatches: uploader.queued(),
        recording: recorder.recording,
      },
  };
  Reflect.set(globalThis, "__rushlineDiagnostics", reader);

  return {
    attachGame(next) {
      probe = next;
      return () => {
        probe = null;
      };
    },
    events,
    qualityRung: () => probe?.snapshot().quality.rung ?? 0,
    recorder,
    sendReport() {
      enqueue("report", true);
      uploader.forceAll();
      uploader.drain();
    },
    settings,
    showing(place) {
      shown = place;
    },
    subscribe(listener) {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
    view() {
      view ??= {
        playerId: player(),
        queued: uploader.queued(),
        report: uploader.report(),
        session: shortSession(sessionId),
        settings: settings.read(),
      };
      return view;
    },
    watchCanvas(canvas, drawing) {
      canvas.addEventListener("webglcontextlost", lost);
      canvas.addEventListener("webglcontextrestored", restored);
      const unwatch = graphicsLoss.watch(canvas, drawing);
      return () => {
        canvas.removeEventListener("webglcontextlost", lost);
        canvas.removeEventListener("webglcontextrestored", restored);
        unwatch();
      };
    },
  };
};

let instance: Diagnostics | null = null;

export const diagnostics = (): Diagnostics => {
  instance ??= createDiagnostics();
  return instance;
};
