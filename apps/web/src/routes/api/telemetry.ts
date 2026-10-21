import { createFileRoute } from "@tanstack/react-router";
import * as Effect from "effect/Effect";
import { flow } from "effect/Function";

import { localTelemetry } from "../../server/telemetry-local.ts";
import { collect } from "../../server/telemetry.ts";

const answer = ({ request }: { readonly request: Request }) =>
  collect(request, localTelemetry());

export const Route = createFileRoute("/api/telemetry")({
  server: { handlers: { POST: flow(answer, Effect.runPromise) } },
});
