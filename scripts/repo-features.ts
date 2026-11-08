import type { FeatureEntry } from "./feature-map.ts";

export const repoFeatures: readonly FeatureEntry[] = [
  {
    docs: ["docs/standards/tooling.md#the-checks"],
    id: "repo-checks",
    kind: "platform",
    owns: [
      "scripts/verify.ts",
      "scripts/check-action-pins*.ts",
      "scripts/check-css-comments.ts",
      "scripts/check-feature-map.ts",
      "scripts/check-renderer-imports.ts",
      "scripts/check-rule-routes*.ts",
      "scripts/check-roots.ts",
      "scripts/check-rules.ts",
      "scripts/check-size*.ts",
      "scripts/check-typescript-only.ts",
      "scripts/check-workflow-runs*.ts",
      "scripts/feature-map*.ts",
      "scripts/*features.ts",
      "scripts/git-files.ts",
      "scripts/node-error.ts",
      "scripts/postcss-tokenize.d.ts",
      "scripts/renderer-imports*.ts",
      "scripts/rule-ledger*.ts",
      "scripts/rule-routes.ts",
      "scripts/setup-effect-reference.ts",
      "scripts/stale-checkout*.ts",
      "scripts/write-feature-map.ts",
    ],
    perf: [],
    start: [
      "scripts/verify.ts",
      "scripts/features.ts",
      "scripts/rule-ledger.ts",
    ],
    summary:
      "`pnpm verify` and the repository checks it runs: the rule ledger, the rule routes, the roots, action pins, workflow runs, renderer imports, source size, CSS comments, TypeScript only, and this feature map with its manifest, and the stale-checkout hook.",
    title: "Repository checks",
    verify: [],
  },
];
