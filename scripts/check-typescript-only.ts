import { execFileSync } from "node:child_process";
import process from "node:process";

const javascript = execFileSync(
  "git",
  [
    "ls-files",
    "--cached",
    "--others",
    "--exclude-standard",
    "*.js",
    "*.mjs",
    "*.cjs",
    "*.jsx",
  ],
  { encoding: "utf-8" }
)
  .split("\n")
  .filter((file) => file !== "");

if (javascript.length > 0) {
  process.stderr.write(
    `${javascript.map((file) => `${file}: repository code is TypeScript; rewrite this file as .ts or .tsx`).join("\n")}\n`
  );
  process.exit(1);
}
process.stdout.write("TypeScript only: ok\n");
