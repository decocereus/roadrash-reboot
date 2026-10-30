import { readFileSync } from "node:fs";
import path from "node:path";

import { noBitwiseRule } from "../rushline/rules/no-bitwise.ts";
import { runRule } from "./cases.ts";

const repository = path.join(import.meta.dirname, "../../..");
const words = ["packages/sim/src/snapshot-hash.ts"];

const inSim = {
  filename: "packages/sim/src/race.ts",
  options: [{ words }],
};

const mixer = {
  code: readFileSync(
    path.join(repository, "packages/sim/src/snapshot-hash.ts"),
    "utf-8"
  ),
  filename: "packages/sim/src/snapshot-hash.ts",
  options: [{ words }],
};

const bitwise = (operator: string, line = 1) => ({
  data: { operator },
  line,
  messageId: "bitwise",
});

runRule("rushline/no-bitwise", noBitwiseRule, {
  invalid: [
    { ...inSim, code: "const word = speed & 0xff;", errors: [bitwise("&")] },
    { ...inSim, code: "const word = speed | 0;", errors: [bitwise("|")] },
    { ...inSim, code: "const word = speed ^ seed;", errors: [bitwise("^")] },
    { ...inSim, code: "const word = ~speed;", errors: [bitwise("~")] },
    { ...inSim, code: "const word = seed << 3;", errors: [bitwise("<<")] },
    { ...inSim, code: "const word = seed >>> 3;", errors: [bitwise(">>>")] },
    {
      ...inSim,
      code: "let word = seed;\nword ^= 0x9e_37_79_b9;",
      errors: [bitwise("^=", 2)],
    },
    {
      ...inSim,
      code: "const mixed = (high ^ low) & mask;",
      errors: [bitwise("&"), bitwise("^")],
    },
  ],
  valid: [
    { ...inSim, code: "const word = Math.imul(speed, 0x27_d4_eb_2d);" },
    { ...inSim, code: "const half = Math.trunc(speed / 2);" },
    { ...inSim, code: "const both = left && right;" },
    { ...inSim, code: "const either = left || right;" },
    mixer,
    {
      code: "const word = seed ^ 1;",
      filename: "packages/sim/src/snapshot-hash.ts",
      options: [{ words }],
    },
  ],
});
