import { launchRules } from "@racer/career/rules";

export const serveRaceRules = (): Response =>
  Response.json(launchRules, { headers: { "cache-control": "no-store" } });
