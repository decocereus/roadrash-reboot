import { artBucketName } from "@racer/art/remote";
import Rooms from "@racer/rooms/worker";
import * as Alchemy from "alchemy";
import * as Cloudflare from "alchemy/Cloudflare";
import * as Config from "effect/Config";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import * as Redacted from "effect/Redacted";

const state = Layer.unwrap(
  Effect.gen(function* stateFor() {
    const { dev } = yield* Alchemy.AlchemyContext;
    return dev ? Alchemy.localState() : Cloudflare.state();
  })
);

export default Alchemy.Stack(
  "Rushline",
  {
    providers: Cloudflare.providers(),
    state,
  },
  Effect.gen(function* rushline() {
    const stage = yield* Alchemy.Stage;
    const art = yield* Cloudflare.R2.Bucket("Art", { name: artBucketName });
    const rooms = yield* Rooms;
    const webPort = yield* Config.Int("RUSHLINE_WEB_PORT").pipe(
      Config.withDefault(1350)
    );
    const web = yield* Cloudflare.Website.Vite("Web", {
      dev: { port: webPort, strictPort: true },
      env: {
        ART: art,
        POSTHOG_PROJECT_KEY: Config.Redacted("POSTHOG_PROJECT_KEY").pipe(
          Config.withDefault(Redacted.make(""))
        ),
        VITE_ROOMS_URL: rooms.url.as<string>(),
      },
      memo: {
        include: [
          "**/*",
          "../../packages/*/src/**",
          "../../packages/*/package.json",
          "../rooms/src/**",
          "../rooms/package.json",
        ],
        lockfile: true,
      },
      name:
        stage === "prod"
          ? "rushline"
          : `rushline-${stage.replaceAll("_", "-")}`,
      rootDir: `${import.meta.dirname}/apps/web`,
    });

    return {
      roomsUrl: rooms.url.as<string>(),
      webUrl: web.url.as<string>(),
    };
  })
);
