import { readFileSync } from "node:fs";
import process from "node:process";

import { Input } from "postcss";
import tokenizer from "postcss/lib/tokenize";

import { repositoryFiles } from "./git-files.ts";

const files = repositoryFiles(".", ["*.css"]);

const commentsIn = (file: string) => {
  const input = new Input(readFileSync(file, "utf-8"), { from: file });
  const tokens = tokenizer(input);
  const lines: number[] = [];
  while (!tokens.endOfFile()) {
    const [kind, , start = 0] = tokens.nextToken();
    if (kind === "comment") {
      lines.push(input.fromOffset(start)?.line ?? 0);
    }
  }
  return lines.map(
    (line) =>
      `${file}:${line}: delete this comment. CSS carries no comments; put rationale in docs/ or the commit message.`
  );
};

const problems = files.flatMap(commentsIn);

if (problems.length > 0) {
  process.stderr.write(`${problems.join("\n")}\n`);
  process.exit(1);
}
process.stdout.write(`CSS comments: ok (${files.length} files)\n`);
