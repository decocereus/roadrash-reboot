import { existsSync } from "node:fs";
import { join } from "node:path";
import { spawnSync } from "node:child_process";

const root = join(import.meta.dirname, "..");
const candidates = [
  "apps",
  "packages",
  "infra",
  "scripts",
  "tools",
  ".oxfmtrc.json",
  "oxlint.config.ts",
  "package.json",
  "playwright.config.ts",
  "tsconfig.base.json",
];
const paths = candidates.filter((path) => existsSync(join(root, path)));
const mode = process.argv.includes("--write") ? [] : ["--check"];
const result = spawnSync("oxfmt", [...mode, ...paths], {
  cwd: root,
  stdio: "inherit",
});
process.exitCode = result.status ?? 1;
