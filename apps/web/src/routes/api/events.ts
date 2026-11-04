import { createFileRoute } from "@tanstack/react-router";
import * as Effect from "effect/Effect";

import { forwardPlayerEvents } from "../../server/player-events.ts";

const answer = async ({ request }: { readonly request: Request }) => {
  const { env } = await import("cloudflare:workers");
  return await Effect.runPromise(
    forwardPlayerEvents(
      request,
      env.POSTHOG_PROJECT_KEY,
      globalThis.fetch.bind(globalThis)
    )
  );
};

export const Route = createFileRoute("/api/events")({
  server: { handlers: { POST: answer } },
});
