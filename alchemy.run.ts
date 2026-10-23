import * as Alchemy from "alchemy";
import * as Cloudflare from "alchemy/Cloudflare";
import * as Effect from "effect/Effect";

export class Web extends Cloudflare.Website.Vite<Web>()("Web", {
  dev: { port: 1350, strictPort: true },
  rootDir: `${import.meta.dirname}/apps/web`,
}) {}

export default Alchemy.Stack(
  "Rushline",
  {
    providers: Cloudflare.providers(),
    state: Alchemy.localState(),
  },
  Effect.gen(function* rushline() {
    const web = yield* Web;

    return {
      webUrl: web.url.as<string>(),
    };
  })
);
