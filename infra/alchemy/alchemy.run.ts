import * as Alchemy from "alchemy";
import * as Cloudflare from "alchemy/Cloudflare";
import * as Effect from "effect/Effect";

const RaceRoom = Cloudflare.DurableObject("RaceRoom", { className: "RaceRoom" });

export default Alchemy.Stack(
  "racer",
  {
    providers: Cloudflare.providers(),
    state: Cloudflare.state(),
  },
  Effect.gen(function* () {
    const results = yield* Cloudflare.D1.Database("RaceResults", {
      migrations: "./migrations",
    });
    const worker = yield* Cloudflare.Worker("RacerEdge", {
      main: "../../apps/edge/src/worker.ts",
      compatibility: { date: "2026-09-24" },
      assets: {
        directory: "../../apps/web/dist",
        runWorkerFirst: ["/api/*", "/ws/*"],
        notFoundHandling: "single-page-application",
      },
      env: {
        RACE_ROOM: RaceRoom,
        RESULTS_DB: results,
      },
    });
    return { workerUrl: worker.url };
  }),
);
