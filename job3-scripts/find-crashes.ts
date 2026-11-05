// Steps the stress race in Node, as the perf lanes do, and lists every crash with its gap to the player.
import { benchRun } from "/var/tmp/rushline-r4-b/tools/perf/src/scenarios.ts";
const run = benchRun("stress");
const rows = [];
for (let i = 0; i < 6000; i += 1) {
  run.step();
  const v = run.view;
  const player = v.riders.find((r) => r.id === "player" ) ?? v.riders[0];
  for (const e of v.events) {
    if (e.kind === "crash" || e.kind === "knockedDown") {
      const r = v.riders.find((x) => x.id === e.rider);
      rows.push({ tick: v.tick, kind: e.kind, rider: e.rider, cause: e.cause, speed: Math.round(e.speed ?? 0), gap: r ? Math.round(r.s - player.s) : null, playerS: Math.round(player.s), offset: r? Number(r.lane ?? 0):null });
    }
  }
}
console.log(rows.length);
for (const r of rows) console.log(JSON.stringify(r));
