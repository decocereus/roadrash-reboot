import { artBucketName } from "@racer/art/remote";
import * as Alchemy from "alchemy";
import * as Cloudflare from "alchemy/Cloudflare";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";

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
    const web = yield* Cloudflare.Website.Vite("Web", {
      dev: { port: 1350, strictPort: true },
      env: { ART: art },
      memo: {
        include: [
          "**/*",
          "../../packages/*/src/**",
          "../../packages/*/package.json",
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
      webUrl: web.url.as<string>(),
    };
  })
);
