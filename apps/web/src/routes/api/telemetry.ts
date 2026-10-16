import { telemetryStore } from "@racer/telemetry/store";
import { createFileRoute } from "@tanstack/react-router";

import { ingestTelemetry } from "../../server/telemetry.ts";

export const Route = createFileRoute("/api/telemetry")({
  server: {
    handlers: {
      POST: ({ request }) => ingestTelemetry(request, telemetryStore()),
    },
  },
});
