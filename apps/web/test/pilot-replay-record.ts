import { execFileSync } from "node:child_process";
import { readFileSync, writeFileSync } from "node:fs";

import { decodeBaseline, recordBaseline } from "./pilot-replay-baseline.ts";
import {
  close,
  FIXED_RIDE,
  openCase,
  replayCases,
  ride,
  rideToEnd,
  TICK_LIMIT,
  WINDOW,
} from "./pilot-replay.ts";

const baselineUrl = new URL("pilot-replay-baseline.json", import.meta.url);

const git = (...args: string[]): string =>
  execFileSync("git", args, { encoding: "utf-8" }).trim();

const reason = process.argv.slice(2).join(" ");
if (reason.length === 0) {
  process.stderr.write(
    'Usage: pnpm replay:record "when <what changed and why the hashes moved>."\n'
  );
  process.exit(1);
}
const before = decodeBaseline(readFileSync(baselineUrl, "utf-8"));
const { baseline, rows } = recordBaseline(before, {
  fixed: replayCases.map((replay) => close(ride(openCase(replay), FIXED_RIDE))),
  fixedRide: FIXED_RIDE,
  limit: TICK_LIMIT,
  reason,
  recordedAt: [
    git("rev-parse", "--short", "HEAD"),
    git("branch", "--show-current"),
  ],
  solo: replayCases.map((replay) =>
    close(rideToEnd(openCase(replay), TICK_LIMIT))
  ),
  window: WINDOW,
});
writeFileSync(baselineUrl, `${JSON.stringify(baseline, null, 2)}\n`);
process.stdout.write(`${rows}\n`);
