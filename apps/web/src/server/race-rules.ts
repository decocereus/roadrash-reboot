import type { RaceRules } from "@racer/career/rules";

const raceRules: RaceRules = {
  fieldSize: 10,
  levelCount: 3,
  police: { 1: 1, 2: 2, 3: 3, 4: 4, 5: 5 },
};

export const serveRaceRules = (): Response =>
  Response.json(raceRules, { headers: { "cache-control": "no-store" } });
