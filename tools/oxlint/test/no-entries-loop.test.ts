import { noEntriesLoopRule } from "../rushline/rules/no-entries-loop.ts";
import { runRule } from "./cases.ts";

const entries = [{ messageId: "entries" }];

const traversal = [
  {
    message:
      "Iterating entries() builds an iterator and a pair for every element. Read an array or typed array by index, and walk a Map, a Set or any other collection with a traversal that suits it.",
  },
];

runRule("rushline/no-entries-loop", noEntriesLoopRule, {
  invalid: [
    {
      code: "for (const [index, rider] of state.riders.entries()) {\n  use(index, rider);\n}",
      errors: entries,
    },
    {
      code: "for (const pair of riders.entries()) {\n  use(pair);\n}",
      errors: entries,
    },
    {
      code: 'for (const [index, rider] of riders["entries"]()) {\n  use(index, rider);\n}',
      errors: entries,
    },
    {
      code: "for (const [index, strike] of settleStrikes(state).entries()) {\n  use(index, strike);\n}",
      errors: entries,
    },
    {
      code: "for (const rider of riders) {\n  for (const [hand, meshes] of rider.held.entries()) {\n    use(hand, meshes);\n  }\n}",
      errors: [{ line: 2, messageId: "entries" }],
    },
    {
      code: "const pairs = state.riders.entries();\nfor (const [i, r] of pairs) {\n  use(i, r);\n}",
      errors: [{ line: 2, messageId: "entries" }],
    },
    {
      code: "const seen = new Map<number, string>();\nfor (const [id, name] of seen.entries()) {\n  use(id, name);\n}",
      errors: traversal,
    },
    {
      code: "const kinds = new Set<string>();\nfor (const [kind] of kinds.entries()) {\n  use(kind);\n}",
      errors: traversal,
    },
  ],
  valid: [
    "for (let index = 0; index < riders.length; index += 1) {\n  use(index, riders[index]);\n}",
    "for (const rider of riders) {\n  use(rider);\n}",
    "for (const index of riders.keys()) {\n  use(index);\n}",
    "for (const rider of riders.values()) {\n  use(rider);\n}",
    "for (const [s, x] of points) {\n  use(s, x);\n}",
    "for (const [name, value] of Object.entries(table)) {\n  use(name, value);\n}",
    "for (const [index, rider] of riders[method]()) {\n  use(index, rider);\n}",
    "for (const row of ledger.entries(since)) {\n  use(row);\n}",
    "const first = batch.entries().next();",
    "const { riders } = state;\nconst [first] = riders;",
    "const pairs = state.riders.entries();\nconst walk = (pairs: readonly Rider[]) => {\n  for (const rider of pairs) {\n    use(rider);\n  }\n};",
    "let pairs = state.riders.entries();\npairs = [].values();\nfor (const pair of pairs) {\n  use(pair);\n}",
  ],
});
