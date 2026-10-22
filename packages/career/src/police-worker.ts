import { workerData } from "node:worker_threads";

import * as Schema from "effect/Schema";

import { recordRide, takeStart } from "./police-fixtures.ts";

const decodeSeason = Schema.decodeUnknownSync(
  Schema.instanceOf(SharedArrayBuffer)
);

const season = new Int32Array(decodeSeason(workerData));
for (let index = takeStart(season); index >= 0; index = takeStart(season)) {
  recordRide(season, index);
}
