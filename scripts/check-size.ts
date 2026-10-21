import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import process from "node:process";

import { hasCode } from "./node-error.ts";

const limit = 20_000;
const sourceFile = /\.(?:sql|ts|tsx|css)$/u;

const files = execFileSync(
  "git",
  ["ls-files", "--cached", "--others", "--exclude-standard"],
  { encoding: "utf-8" }
)
  .split("\n")
  .filter((file) => sourceFile.test(file));

const problems: string[] = [];
for (const file of files) {
  try {
    const { length } = readFileSync(file, "utf-8");
    if (length > limit) {
      problems.push(
        `${file} has ${length} characters. A source file may have at most ${limit}; split it.`
      );
    }
  } catch (error) {
    if (!hasCode(error, "ENOENT")) {
      throw error;
    }
  }
}

if (problems.length > 0) {
  process.stderr.write(`${problems.join("\n")}\n`);
  process.exit(1);
}
process.stdout.write(`Size: ok (${files.length} source files)\n`);
