import { UPLOAD_QUEUE_CAPACITY } from "@racer/telemetry/limits";
import type { Batch } from "@racer/telemetry/schema";

import type { Outgoing } from "./recorder.ts";

export const UPLOAD_ENDPOINT = "/api/telemetry";

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

export interface Entry {
  readonly batch: Batch;
  readonly body: string;
  forced: boolean;
  attempts: number;
}

export type Delivery =
  | { readonly kind: "saved" }
  | { readonly kind: "rejected"; readonly reason: string }
  | { readonly kind: "retry"; readonly reason: string };

export interface UploadQueue {
  readonly next: () => Entry | undefined;
  readonly settle: (entry: Entry, delivery: Delivery) => boolean;
}

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

export const createUploader = (
  requestDelivery: (queue: UploadQueue) => void
): Uploader => {
  const queue: Entry[] = [];
  const listeners = new Set<() => void>();
  let automatic = false;
  let dropped = 0;
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

  const settle = (entry: Entry, delivery: Delivery): boolean => {
    const index = queue.indexOf(entry);
    if (index === -1) {
      return false;
    }
    const reportId = entry.batch.reportId ?? "";
    if (delivery.kind === "retry") {
      entry.attempts += 1;
      setReport(entry, { reason: delivery.reason, reportId, state: "queued" });
      return true;
    }
    queue.splice(index, 1);
    setReport(
      entry,
      delivery.kind === "saved"
        ? { reportId, state: "saved" }
        : { reason: delivery.reason, reportId, state: "failed" }
    );
    notify();
    return false;
  };

  const port: UploadQueue = { next: sendable, settle };

  return {
    beacon() {
      for (const entry of queue.filter((each) => automatic || each.forced)) {
        navigator.sendBeacon(
          UPLOAD_ENDPOINT,
          new Blob([entry.body], { type: "application/json" })
        );
      }
    },
    drain() {
      if (sendable() !== undefined) {
        requestDelivery(port);
      }
    },
    droppedBatches: () => dropped,
    enqueue(outgoing, forced) {
      if (queue.length >= UPLOAD_QUEUE_CAPACITY) {
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
