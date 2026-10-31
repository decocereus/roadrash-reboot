import { workerData } from "node:worker_threads";

import * as Schema from "effect/Schema";

import { runCold } from "./replay-bundle.ts";

const decodeOrder = Schema.decodeUnknownSync(
  Schema.Struct({
    checkpoint: Schema.String,
    frames: Schema.instanceOf(SharedArrayBuffer),
    id: Schema.String,
    ticks: Schema.Number,
  })
);

const order = decodeOrder(workerData);
const frames = runCold(order.id, order.checkpoint, order.ticks);
new TextEncoder().encodeInto(frames.join(""), new Uint8Array(order.frames));
