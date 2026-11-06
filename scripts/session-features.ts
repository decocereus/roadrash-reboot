import type { FeatureEntry } from "./feature-map.ts";

export const sessionFeatures: readonly FeatureEntry[] = [
  {
    docs: [
      "docs/architecture/browser-client.md#browser-client",
      "docs/standards/web-app.md#keep-each-module-to-its-job",
    ],
    id: "race-session",
    kind: "platform",
    owns: [
      "apps/web/src/game/game-session.ts",
      "apps/web/test/game-session.test.ts",
      "apps/web/test/session-transcript.ts",
    ],
    perf: ["frame.interval.p95", "frame.missedFraction"],
    start: ["apps/web/src/game/game-session.ts"],
    summary:
      "One value for what the game is doing: attract, idle with or without a preparation, the countdown, the race with its pause and resume hold, and the settled race with its consequence delay. Pure transitions and the counters a tick spends live here, and game.ts performs the effects.",
    title: "Race session",
    verify: ["single-race.md"],
  },
];
