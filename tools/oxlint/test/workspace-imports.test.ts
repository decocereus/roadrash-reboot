import { workspaceImportsRule } from "../rushline/rules/workspace-imports.ts";
import { runRule } from "./cases.ts";

const fixtures = "tools/oxlint/test/fixtures";
const inA = `${fixtures}/ws-a/src/a.ts`;
const inB = `${fixtures}/ws-b/src/b.ts`;
const inRoot = `${fixtures}/scripts/run.ts`;
const intoB = "../../ws-b/src/b.ts";
const crossesIntoB = [
  {
    data: {
      from: `${fixtures}/ws-a`,
      manifest: `${fixtures}/ws-a/package.json`,
      source: intoB,
      target: "@fixture/ws-b",
      to: `${fixtures}/ws-b`,
    },
    messageId: "crossesWorkspace",
  },
];

runRule("rushline/workspace-imports", workspaceImportsRule, {
  invalid: [
    {
      code: `import { b } from '${intoB}';`,
      errors: crossesIntoB,
      filename: inA,
    },
    {
      code: `import type { B } from '${intoB}';`,
      errors: crossesIntoB,
      filename: inA,
    },
    {
      code: `export { b } from '${intoB}';`,
      errors: crossesIntoB,
      filename: inA,
    },
    {
      code: `export * from '${intoB}';`,
      errors: crossesIntoB,
      filename: inA,
    },
    {
      code: `const b = import('${intoB}');`,
      errors: crossesIntoB,
      filename: inA,
    },
    {
      code: "import { run } from '../../scripts/run.ts';",
      errors: [
        {
          data: {
            from: `${fixtures}/ws-a`,
            manifest: `${fixtures}/ws-a/package.json`,
            source: "../../scripts/run.ts",
            target: "fixture-root",
            to: fixtures,
          },
          messageId: "crossesWorkspace",
        },
      ],
      filename: inA,
    },
    {
      code: "import { a } from '../ws-a/src/a.ts';",
      errors: [{ messageId: "crossesWorkspace" }],
      filename: inRoot,
    },
    {
      code: "import { a } from '@fixture/ws-a/a';",
      errors: [
        {
          data: {
            manifest: `${fixtures}/ws-b/package.json`,
            name: "@fixture/ws-a",
          },
          messageId: "undeclared",
        },
      ],
      filename: inB,
    },
    {
      code: "import { only } from 'fixture-root-only';",
      errors: [
        {
          data: {
            manifest: `${fixtures}/ws-a/package.json`,
            name: "fixture-root-only",
          },
          messageId: "undeclared",
        },
      ],
      filename: inA,
    },
    {
      code: "import { lib } from 'fixture-lib/deep/path.ts';",
      errors: [{ messageId: "undeclared" }],
      filename: inB,
    },
    {
      code: "export * from '@fixture/unknown';",
      errors: [{ messageId: "undeclared" }],
      filename: inA,
    },
    {
      code: "const lib = import(`fixture-unknown`);",
      errors: [{ messageId: "undeclared" }],
      filename: inA,
    },
  ],
  valid: [
    { code: "import { a2 } from './a2.ts';", filename: inA },
    { code: "import type { A2 } from './nested/a2.ts';", filename: inA },
    { code: "import { a2 } from '../../ws-a/src/a2.ts';", filename: inA },
    { code: "import { lib } from 'fixture-lib';", filename: inA },
    { code: "import { lib } from 'fixture-lib/deep/path.ts';", filename: inA },
    { code: "import { dev } from 'fixture-dev';", filename: inA },
    { code: "import type { Peer } from 'fixture-peer';", filename: inA },
    { code: "import { b } from '@fixture/ws-b/b';", filename: inA },
    { code: "import { a } from '@fixture/ws-a/a';", filename: inA },
    { code: "import path from 'node:path';", filename: inB },
    {
      code: "const { env } = await import('cloudflare:workers');",
      filename: inB,
    },
    { code: "import { only } from 'fixture-root-only';", filename: inRoot },
    { code: "export { b } from '@fixture/ws-b/b';", filename: inA },
    { code: "const lib = import('fixture-lib');", filename: inA },
    { code: "const loaded = import(specifier);", filename: inA },
  ],
});
