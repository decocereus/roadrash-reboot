import { describe, expect, it } from "vitest";

import {
  anchorsOf,
  featureMapProblems,
  renderFeatureMap,
  sourceFilesOf,
} from "./feature-map.ts";
import type { FeatureEntry, Repository } from "./feature-map.ts";
import { features } from "./features.ts";

const hazards: FeatureEntry = {
  docs: ["docs/architecture.md#hazards-as-race-state"],
  id: "hazards",
  kind: "feature",
  owns: ["packages/sim/src/hazard*.ts", "apps/web/src/game/hazards.ts"],
  perf: ["sim.tick.p95"],
  start: ["packages/sim/src/hazards.ts"],
  summary: "Oil slicks, rocks and potholes on the road.",
  title: "Road hazards",
  verify: ["riding-and-fighting.md"],
};

const checks: FeatureEntry = {
  docs: [],
  id: "repo-checks",
  kind: "platform",
  owns: ["scripts/**"],
  perf: [],
  start: ["scripts/verify.ts"],
  summary: "The repository checks.",
  title: "Repository checks",
  verify: [],
};

const files = [
  "apps/web/src/game/hazards.ts",
  "packages/sim/src/hazard-contact.test.ts",
  "packages/sim/src/hazards.ts",
  "scripts/verify.ts",
];

const problemsOf = (
  entries: readonly FeatureEntry[],
  changes: Partial<Repository> = {}
) => {
  const tree = changes.files ?? files;
  return featureMapProblems(entries, {
    budgets: new Set(["sim.tick.p95", "sim.tick.p99"]),
    docs: new Map([
      ["docs/architecture.md", "# Architecture\n\n### Hazards as race state\n"],
    ]),
    files: tree,
    map: renderFeatureMap(entries, tree),
    recipes: new Set(["riding-and-fighting.md"]),
    ...changes,
  });
};

describe("the feature map check", () => {
  it("passes when every file has one owner and every link resolves", () => {
    expect(problemsOf([hazards, checks])).toStrictEqual([]);
  });

  it("fails a source file no entry owns", () => {
    expect(
      problemsOf([hazards, checks], {
        files: [...files, "packages/sim/src/junctions.ts"],
      })
    ).toStrictEqual([
      "packages/sim/src/junctions.ts: no entry in scripts/*features.ts owns this file; add it to the owns list of the entry whose behaviour it implements, then run `pnpm feature-map`.",
    ]);
  });

  it("fails a file two entries own, with no precedence between them", () => {
    const sim = {
      ...checks,
      id: "sim",
      owns: ["packages/sim/src/**"],
    } as const;
    expect(problemsOf([hazards, sim, checks])).toStrictEqual([
      "packages/sim/src/hazard-contact.test.ts: owned by hazards, sim; narrow their owns patterns in scripts/*features.ts so exactly one entry matches it.",
      "packages/sim/src/hazards.ts: owned by hazards, sim; narrow their owns patterns in scripts/*features.ts so exactly one entry matches it.",
      'sim: the start file "scripts/verify.ts" is not a file sim owns; start lists one to three files of the entry\'s own.',
    ]);
  });

  it("fails an owns pattern that matches no source file", () => {
    const stale = {
      ...hazards,
      owns: [...hazards.owns, "apps/web/src/game/hazard-marks.ts"],
    } as const;
    expect(problemsOf([stale, checks])).toStrictEqual([
      'hazards: the owns pattern "apps/web/src/game/hazard-marks.ts" matches no source file; fix the pattern or remove it.',
    ]);
  });

  it("fails duplicate ids and ids that are not kebab-case", () => {
    const twin = { ...checks, owns: ["scripts/nothing-here/**"] } as const;
    const camel = { ...hazards, id: "roadHazards" };
    expect(problemsOf([camel, checks, twin])).toStrictEqual([
      'scripts/*features.ts: 2 entries have the id "repo-checks"; give each entry its own id.',
      'scripts/*features.ts: the id "roadHazards" is not kebab-case; use lower-case words joined by hyphens.',
      'repo-checks: the owns pattern "scripts/nothing-here/**" matches no source file; fix the pattern or remove it.',
      'repo-checks: the start file "scripts/verify.ts" is not a file repo-checks owns; start lists one to three files of the entry\'s own.',
    ]);
  });

  it("fails a start file the entry does not own", () => {
    const wrong = {
      ...hazards,
      start: ["packages/sim/src/hazards.ts", "scripts/verify.ts"],
    } as const;
    expect(problemsOf([wrong, checks])).toStrictEqual([
      'hazards: the start file "scripts/verify.ts" is not a file hazards owns; start lists one to three files of the entry\'s own.',
    ]);
  });

  it("fails a docs link to a file that does not exist", () => {
    const moved = {
      ...hazards,
      docs: ["docs/hazards.md#where-hazards-lie"],
    } as const;
    expect(problemsOf([moved, checks])).toStrictEqual([
      'hazards: the docs link "docs/hazards.md#where-hazards-lie" names a file that does not exist; link a section of an existing doc.',
    ]);
  });

  it("fails a docs link whose heading anchor does not exist", () => {
    const renamed = {
      ...hazards,
      docs: ["docs/architecture.md#hazards"],
    } as const;
    expect(problemsOf([renamed, checks])).toStrictEqual([
      'hazards: the docs link "docs/architecture.md#hazards" names no heading in docs/architecture.md; use the anchor GitHub gives one of its headings (lower case, punctuation dropped, spaces as hyphens).',
    ]);
  });

  it("fails a verify recipe that does not exist", () => {
    const missing = { ...hazards, verify: ["hazards.md"] } as const;
    expect(problemsOf([missing, checks])).toStrictEqual([
      'hazards: the verify recipe "hazards.md" is not a file in .claude/skills/verify-rushline/features; name an existing feature file or leave verify empty.',
    ]);
  });

  it("fails a perf id that budgets.json does not have", () => {
    const unknown = {
      ...hazards,
      perf: ["sim.tick.p95", "sim.tick.p50"],
    } as const;
    expect(problemsOf([unknown, checks])).toStrictEqual([
      'hazards: the perf id "sim.tick.p50" is not a metric in tools/perf/budgets.json; use a metric its limits name or leave perf empty.',
    ]);
  });

  it("fails a map that differs from what the generator writes, or is missing", () => {
    const stale = renderFeatureMap([hazards, checks], files.slice(1));
    expect(problemsOf([hazards, checks], { map: stale })).toStrictEqual([
      "docs/feature-map.md is out of date with scripts/features.ts; run `pnpm feature-map`.",
    ]);
    expect(problemsOf([hazards, checks], { map: null })).toStrictEqual([
      "docs/feature-map.md does not exist; run `pnpm feature-map`.",
    ]);
  });
});

describe("heading anchors", () => {
  it("follow GitHub's slugs, skipping front matter and fenced code", () => {
    const doc = [
      "---",
      "# not: a heading",
      "---",
      "# Rushline architecture",
      "## 0. Launch direction",
      "## Elevation & Depth",
      "### Do's and Don'ts",
      "```sh",
      "# a shell comment",
      "```",
      "## Tracks",
      "## Tracks",
      "### `RaceView` and [the run](race-run.md)",
      "## Closed ##",
      "#hashtag",
    ].join("\n");
    expect([...anchorsOf(doc)]).toStrictEqual([
      "rushline-architecture",
      "0-launch-direction",
      "elevation--depth",
      "dos-and-donts",
      "tracks",
      "tracks-1",
      "raceview-and-the-run",
      "closed",
    ]);
  });
});

describe("the generated map", () => {
  const map = renderFeatureMap([checks, hazards], files);

  it("says it is generated, then indexes the entries grouped by kind", () => {
    expect(map.split("\n\n").slice(0, 2)).toStrictEqual([
      "Generated from `scripts/features.ts` by `pnpm feature-map`. Do not edit this file by hand.",
      "# Feature map",
    ]);
    expect(map).toContain(
      "### Features\n\n- [Road hazards](#road-hazards): `hazards`\n\n### Platform\n\n- [Repository checks](#repository-checks): `repo-checks`"
    );
    expect(map.indexOf("## Features\n\n### Road hazards")).toBeLessThan(
      map.indexOf("## Platform\n\n### Repository checks")
    );
  });

  it("lists links, budgets and owned files, split into source and tests", () => {
    expect(map).toContain(
      [
        "- Id: `hazards`",
        "- Start: `packages/sim/src/hazards.ts`",
        "- Docs: [docs/architecture.md#hazards-as-race-state](architecture.md#hazards-as-race-state)",
        "- Verify: [riding-and-fighting.md](../.claude/skills/verify-rushline/features/riding-and-fighting.md)",
        "- Perf: `sim.tick.p95`",
        "- Owns: `packages/sim/src/hazard*.ts`, `apps/web/src/game/hazards.ts`",
        "",
        "Source files:",
        "",
        "- `apps/web/src/game/hazards.ts`",
        "- `packages/sim/src/hazards.ts`",
        "",
        "Test files:",
        "",
        "- `packages/sim/src/hazard-contact.test.ts`",
      ].join("\n")
    );
  });

  it("shows a missing recipe, budget or test as data", () => {
    expect(map).toContain(
      "- Docs: none yet\n- Verify: none yet\n- Perf: none yet\n- Owns: `scripts/**`\n\nSource files:\n\n- `scripts/verify.ts`\n\nTest files: none\n"
    );
  });

  it("is the same text every time it is written", () => {
    expect(renderFeatureMap([checks, hazards], files)).toBe(map);
  });
});

describe("source files", () => {
  it("are the TS, TSX, CSS and SQL files under the four roots", () => {
    expect(
      sourceFilesOf([
        "scripts/verify.ts",
        "apps/web/src/styles.css",
        "apps/web/src/routes/kit.tsx",
        "packages/telemetry/schema.sql",
        "tools/perf/budgets.json",
        "docs/feature-map.md",
        "alchemy.run.ts",
        " packages/ui/src/padded.ts",
      ])
    ).toStrictEqual([
      "apps/web/src/routes/kit.tsx",
      "apps/web/src/styles.css",
      "packages/telemetry/schema.sql",
      "scripts/verify.ts",
    ]);
  });
});

describe("the repository's manifest", () => {
  it("leaves a new file in a flat directory without an owner until someone adds it", () => {
    const newFiles = [
      "apps/web/src/components/consent-banner.tsx",
      "apps/web/src/components/session.ts",
      "apps/web/src/game/car-texture.ts",
      "apps/web/src/game/showroom.ts",
      "packages/sim/src/junctions.ts",
      "packages/career/src/sponsors.ts",
      "apps/web/src/server/accounts.ts",
    ];
    const problems = problemsOf(features, { files: newFiles });
    expect(
      newFiles.filter((file) =>
        problems.some((problem) =>
          problem.startsWith(`${file}: no entry in scripts/*features.ts owns`)
        )
      )
    ).toStrictEqual(newFiles);
  });
});
