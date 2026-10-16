import type { Batch } from "@racer/telemetry/schema";

import type { Outgoing } from "./recorder.ts";

const ENDPOINT = "/api/telemetry";
const QUEUE_CAPACITY = 24;
const FIRST_RETRY_MS = 2000;
const LONGEST_RETRY_MS = 60_000;

export type ReportStatus =
  | { readonly state: "idle" }
  | { readonly state: "sending"; readonly reportId: string }
  | { readonly state: "saved"; readonly reportId: string }
  | {
      readonly state: "queued";
      readonly reportId: string;
      readonly reason: string;
    }
  | {
      readonly state: "failed";
      readonly reportId: string;
      readonly reason: string;
    };

interface Entry {
  readonly batch: Batch;
  readonly body: string;
  forced: boolean;
  attempts: number;
}

type Delivery =
  | { readonly kind: "saved" }
  | { readonly kind: "rejected"; readonly reason: string }
  | { readonly kind: "retry"; readonly reason: string };

export interface Uploader {
  readonly enqueue: (outgoing: Outgoing, forced: boolean) => void;
  readonly forceAll: () => void;
  readonly drain: () => void;
  readonly setAutomatic: (automatic: boolean) => void;
  readonly queued: () => number;
  readonly droppedBatches: () => number;
  readonly report: () => ReportStatus;
  readonly beacon: () => void;
  readonly subscribe: (listener: () => void) => () => void;
}

const deliver = async (entry: Entry): Promise<Delivery> => {
  try {
    const response = await fetch(ENDPOINT, {
      body: entry.body,
      headers: { "content-type": "application/json" },
      method: "POST",
    });
    if (response.ok) {
      return { kind: "saved" };
    }
    const reason = `collector answered ${response.status}`;
    return response.status === 400 || response.status === 413
      ? { kind: "rejected", reason }
      : { kind: "retry", reason };
  } catch {
    return { kind: "retry", reason: "collector unreachable" };
  }
};

export const createUploader = (): Uploader => {
  const queue: Entry[] = [];
  const listeners = new Set<() => void>();
  let automatic = false;
  let dropped = 0;
  let sending = false;
  let retryTimer: ReturnType<typeof setTimeout> | null = null;
  let report: ReportStatus = { state: "idle" };

  const notify = () => {
    for (const listener of listeners) {
      listener();
    }
  };

  const setReport = (entry: Entry, next: ReportStatus) => {
    if (entry.batch.reportId !== null) {
      report = next;
      notify();
    }
  };

  const sendable = (): Entry | undefined =>
    queue.find((entry) => automatic || entry.forced);

  const scheduleRetry = (attempts: number) => {
    if (retryTimer !== null) {
      return;
    }
    const wait = Math.min(LONGEST_RETRY_MS, FIRST_RETRY_MS * 2 ** attempts);
    retryTimer = setTimeout(() => {
      retryTimer = null;
      drain();
    }, wait);
  };

  const settle = (entry: Entry, delivery: Delivery): boolean => {
    const reportId = entry.batch.reportId ?? "";
    if (delivery.kind === "retry") {
      entry.attempts += 1;
      setReport(entry, { reason: delivery.reason, reportId, state: "queued" });
      scheduleRetry(entry.attempts);
      return false;
    }
    queue.splice(queue.indexOf(entry), 1);
    setReport(
      entry,
      delivery.kind === "saved"
        ? { reportId, state: "saved" }
        : { reason: delivery.reason, reportId, state: "failed" }
    );
    notify();
    return true;
  };

  const drain = () => {
    if (sending || retryTimer !== null) {
      return;
    }
    const entry = sendable();
    if (!entry) {
      return;
    }
    sending = true;
    void deliver(entry).then((delivery) => {
      sending = false;
      if (settle(entry, delivery)) {
        drain();
      }
    });
  };

  return {
    beacon() {
      for (const entry of queue.filter((each) => automatic || each.forced)) {
        navigator.sendBeacon(
          ENDPOINT,
          new Blob([entry.body], { type: "application/json" })
        );
      }
    },
    drain,
    droppedBatches: () => dropped,
    enqueue(outgoing, forced) {
      if (queue.length >= QUEUE_CAPACITY) {
        const oldest = queue.findIndex(
          (entry) => entry.batch.reportId === null
        );
        queue.splice(Math.max(0, oldest), 1);
        dropped += 1;
      }
      const entry: Entry = { ...outgoing, attempts: 0, forced };
      queue.push(entry);
      if (outgoing.batch.reportId !== null) {
        report = { reportId: outgoing.batch.reportId, state: "sending" };
      }
      notify();
    },
    forceAll() {
      for (const entry of queue) {
        entry.forced = true;
      }
    },
    queued: () => queue.length,
    report: () => report,
    setAutomatic(next) {
      automatic = next;
    },
    subscribe(listener) {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
  };
};
