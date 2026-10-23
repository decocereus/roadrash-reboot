import process from "node:process";

import { repositoryFiles } from "./git-files.ts";

const javascript = repositoryFiles(".", ["*.js", "*.mjs", "*.cjs", "*.jsx"]);

if (javascript.length > 0) {
  process.stderr.write(
    `${javascript.map((file) => `${file}: repository code is TypeScript; rewrite this file as .ts or .tsx`).join("\n")}\n`
  );
  process.exit(1);
}
process.stdout.write("TypeScript only: ok\n");
