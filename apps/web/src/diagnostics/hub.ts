import { shortSession } from "@racer/telemetry/limits";
import type {
  BatchKind,
  FaultSource,
  TestDevice,
} from "@racer/telemetry/limits";
import type { Quality, Session, TelemetryEvent } from "@racer/telemetry/schema";

import type { ProfileFrame } from "../game/profile.ts";
import { createRecorder } from "./recorder.ts";
import type { Recorder } from "./recorder.ts";
import { createSettingsStore } from "./settings.ts";
import type { Settings, SettingsStore } from "./settings.ts";
import { createUploader } from "./uploader.ts";
import type { ReportStatus } from "./uploader.ts";

const FLUSH_MS = 30_000;
const USER_AGENT_LENGTH = 240;

export interface GameSnapshot {
  readonly phase: string;
  readonly race: number;
  readonly tick: number;
  readonly quality: Quality;
}

export interface GameProbe {
  readonly renderer: string;
  readonly snapshot: () => GameSnapshot;
  readonly frameAt: (frame: number) => ProfileFrame | null;
  readonly latestFrame: () => number;
}

export interface DiagnosticsView {
  readonly settings: Settings;
  readonly report: ReportStatus;
  readonly queued: number;
  readonly session: string;
}

export interface DiagnosticsSnapshot extends GameSnapshot {
  readonly recording: boolean;
  readonly contextLost: boolean;
  readonly queuedBatches: number;
  readonly droppedRecords: number;
}

export interface DiagnosticsReader {
  readonly info: () => Session;
  readonly snapshot: () => DiagnosticsSnapshot | null;
  readonly frames: (afterFrame: number, limit: number) => ProfileFrame[];
  readonly events: (afterSeq: number, limit: number) => TelemetryEvent[];
  readonly flush: () => void;
}

export interface Diagnostics {
  readonly settings: SettingsStore;
  readonly recorder: Recorder;
  readonly attachGame: (probe: GameProbe) => () => void;
  readonly watchCanvas: (canvas: HTMLCanvasElement) => () => void;
  readonly sendReport: () => void;
  readonly view: () => DiagnosticsView;
  readonly subscribe: (listener: () => void) => () => void;
}

const sanitise = (text: string): string =>
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

const createDiagnostics = (): Diagnostics => {
  const settings = createSettingsStore();
  const recorder = createRecorder();
  const uploader = createUploader();
  const sessionId = crypto.randomUUID();
  const startedAt = new Date().toISOString();
  const listeners = new Set<() => void>();
  let probe: GameProbe | null = null;
  let contextLost = false;
  let view: DiagnosticsView | null = null;

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
      fault("rejection", messageOf(event.reason), "");
    }
  );
  document.addEventListener("visibilitychange", () => {
    recorder.visibility(document.hidden);
  });
  window.addEventListener("pagehide", () => {
    if (recorder.recording) {
      enqueue("final", false);
      uploader.beacon();
    }
  });
  setInterval(flush, FLUSH_MS);
  settings.subscribe(apply);
  uploader.subscribe(notify);
  apply();

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
    recorder,
    sendReport() {
      enqueue("report", true);
      uploader.forceAll();
      uploader.drain();
    },
    settings,
    subscribe(listener) {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
    view() {
      view ??= {
        queued: uploader.queued(),
        report: uploader.report(),
        session: shortSession(sessionId),
        settings: settings.read(),
      };
      return view;
    },
    watchCanvas(canvas) {
      canvas.addEventListener("webglcontextlost", lost);
      canvas.addEventListener("webglcontextrestored", restored);
      return () => {
        canvas.removeEventListener("webglcontextlost", lost);
        canvas.removeEventListener("webglcontextrestored", restored);
      };
    },
  };
};

let instance: Diagnostics | null = null;

export const diagnostics = (): Diagnostics => {
  instance ??= createDiagnostics();
  return instance;
};
