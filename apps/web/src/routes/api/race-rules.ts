import { createFileRoute } from "@tanstack/react-router";

import { serveRaceRules } from "../../server/race-rules.ts";

export const Route = createFileRoute("/api/race-rules")({
  server: { handlers: { GET: serveRaceRules } },
});
