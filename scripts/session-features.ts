import type { FeatureEntry } from "./feature-map.ts";

export const sessionFeatures: readonly FeatureEntry[] = [
  {
    docs: [
      "docs/architecture.md#browser-client",
      "docs/coding-standards.md#keep-each-module-to-its-job",
    ],
    id: "race-session",
    kind: "platform",
    owns: ["apps/web/test/session-transcript.ts"],
    perf: ["frame.interval.p95", "frame.missedFraction"],
    start: ["apps/web/test/session-transcript.ts"],
    summary:
      "What the game does across attract, preparation, the countdown, the race with its pause and resume hold, and the settled race with its consequence delay, printed line by line from a real game.",
    title: "Race session",
    verify: ["single-race.md"],
  },
];
