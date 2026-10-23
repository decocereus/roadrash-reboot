export const TELEMETRY_VERSION = 1;
export const HISTOGRAM_EDGES_MS = [
  8.33, 16.67, 23.33, 33.33, 50, 100, 250, 1000,
] as const;
export const HISTOGRAM_BUCKETS = HISTOGRAM_EDGES_MS.length + 1;
export const MAX_BATCH_BYTES = 48 * 1024;
export const MAX_REQUEST_BYTES = 64 * 1024;
export const MAX_WORST_FRAMES = 32;
export const MAX_EVENTS = 512;
export const MAX_PARTS = 32;
export const MAX_FAULT_TEXT = 240;

export const frameRates = ["auto", "60", "30"] as const;
export type FrameRate = (typeof frameRates)[number];

export const testDevices = ["air", "pro", "unspecified"] as const;
export type TestDevice = (typeof testDevices)[number];

export const governReasons = [
  "late-budget",
  "calm-recovery",
  "native-dpr",
  "pace-fallback",
  "pace-retry",
  "late-burst",
  "calm-retry",
  "device-start",
  "under-rate",
  "steady-30",
  "rate-setting",
] as const;
export type GovernReason = (typeof governReasons)[number];

export const resizeSources = ["observer", "rung", "ladder"] as const;
export type ResizeSource = (typeof resizeSources)[number];

export const raceStages = ["start", "green", "end", "crash", "quit"] as const;
export type RaceStage = (typeof raceStages)[number];

export const faultSources = ["error", "rejection"] as const;
export type FaultSource = (typeof faultSources)[number];

export const batchKinds = ["periodic", "report", "final"] as const;
export type BatchKind = (typeof batchKinds)[number];

export const histogramBucket = (milliseconds: number): number => {
  for (let index = 0; index < HISTOGRAM_EDGES_MS.length; index += 1) {
    if (milliseconds <= (HISTOGRAM_EDGES_MS[index] ?? 0)) {
      return index;
    }
  }
  return HISTOGRAM_EDGES_MS.length;
};

export const shortSession = (sessionId: string): string =>
  sessionId.slice(0, 8);

export const reportIdOf = (sessionId: string, batchId: number): string =>
  `${shortSession(sessionId)}-${batchId}`;

export const UPLOAD_QUEUE_CAPACITY = 24;
export const FIRST_RETRY_MS = 2000;
export const LONGEST_RETRY_MS = 60_000;
