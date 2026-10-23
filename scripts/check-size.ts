import { readFileSync } from "node:fs";
import process from "node:process";

import { repositoryFiles } from "./git-files.ts";

const limit = 20_000;
const sourceFile = /\.(?:sql|ts|tsx|css)$/u;

const files = repositoryFiles(".").filter((file) => sourceFile.test(file));

const problems = files.flatMap((file) => {
  const { length } = readFileSync(file, "utf-8");
  return length > limit
    ? [
        `${file} has ${length} characters. A source file may have at most ${limit}; split it.`,
      ]
    : [];
});

if (problems.length > 0) {
  process.stderr.write(`${problems.join("\n")}\n`);
  process.exit(1);
}
process.stdout.write(`Size: ok (${files.length} source files)\n`);
