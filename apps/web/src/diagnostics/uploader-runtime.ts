import * as Cause from "effect/Cause";
import * as Context from "effect/Context";
import * as Effect from "effect/Effect";
import * as Exit from "effect/Exit";

import { drainQueue } from "./upload/worker.ts";
import type { UploadQueue } from "./uploader.ts";

export interface UploadRuntime {
  readonly drain: (queue: UploadQueue) => void;
}

export const createUploadRuntime = <R>(
  send: typeof globalThis.fetch,
  services: Context.Context<R>
): UploadRuntime => {
  const run = Effect.runForkWith(services);
  let active = false;

  const drain = (queue: UploadQueue): void => {
    if (active) {
      return;
    }
    active = true;
    run(drainQueue(queue, send)).addObserver((exit) => {
      active = false;
      if (Exit.isFailure(exit)) {
        globalThis.reportError(Cause.squash(exit.cause));
      } else if (queue.next() !== undefined) {
        drain(queue);
      }
    });
  };

  return { drain };
};

export const browserUploadRuntime = (): UploadRuntime =>
  createUploadRuntime(globalThis.fetch.bind(globalThis), Context.empty());
