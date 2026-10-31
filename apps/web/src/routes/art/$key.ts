import { createFileRoute } from "@tanstack/react-router";
import * as Effect from "effect/Effect";

import { serveArt } from "../../server/art.ts";

const answer = async ({
  params,
}: {
  readonly params: { readonly key: string };
}) => {
  const { env } = await import("cloudflare:workers");
  return await Effect.runPromise(serveArt(env.ART, params.key));
};

export const Route = createFileRoute("/art/$key")({
  server: { handlers: { GET: answer } },
});
