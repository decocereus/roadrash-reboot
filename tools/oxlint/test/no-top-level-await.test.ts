import { noTopLevelAwaitRule } from "../rushline/rules/no-top-level-await.ts";
import { runRule } from "./cases.ts";

const waits = { messageId: "waits" };

runRule("rushline/no-top-level-await", noTopLevelAwaitRule, {
  invalid: [
    { code: "await MeshoptSimplifier.ready;", errors: [waits] },
    { code: "const table = await load();", errors: [waits] },
    { code: "if (wanted) { await load(); }", errors: [waits] },
    { code: "for await (const part of parts) { use(part); }", errors: [waits] },
    {
      code: "export const sizes = [await first(), 2];",
      errors: [waits],
    },
  ],
  valid: [
    "const rider = async (bytes) => { await MeshoptSimplifier.ready; };",
    "async function load() { await ready; }",
    "const figure = { load: async function () { await ready; } };",
    "const read = async (parts) => { for await (const part of parts) { use(part); } };",
    "const ready = MeshoptSimplifier.ready;",
  ],
});
