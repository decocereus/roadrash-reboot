import { existsSync, readdirSync, readFileSync } from "node:fs";
import { basename, extname, join, relative } from "node:path";

const root = join(import.meta.dirname, "..");
const sourceRoots = ["apps/web/src", "apps/web/app", "apps/web/components", "apps/web/lib"].filter(
  (path) => existsSync(join(root, path)),
);
const sourceExtensions = new Set([".ts", ".tsx"]);
const allowedSpecialNames = new Set(["index", "main", "vite-env"]);
const maxLines = 750;
const files = [];

function visit(path) {
  for (const entry of readdirSync(path, { withFileTypes: true })) {
    const absolutePath = join(path, entry.name);
    if (entry.isDirectory()) {
      visit(absolutePath);
    } else if (sourceExtensions.has(extname(entry.name))) {
      files.push(absolutePath);
    }
  }
}

for (const sourceRoot of sourceRoots) visit(join(root, sourceRoot));

const oversized = [];
const nonKebab = [];
for (const file of files) {
  const lines = readFileSync(file, "utf8").split("\n").length;
  if (lines > maxLines) oversized.push(`${relative(root, file)} (${lines} LOC)`);

  const fileBase = basename(file, extname(file));
  if (!allowedSpecialNames.has(fileBase) && !/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(fileBase)) {
    nonKebab.push(relative(root, file));
  }
}

if (oversized.length || nonKebab.length) {
  if (oversized.length) {
    console.error(`Files over ${maxLines} LOC:`);
    oversized.forEach((file) => console.error(`- ${file}`));
  }
  if (nonKebab.length) {
    console.error("Source files must use kebab-case names:");
    nonKebab.forEach((file) => console.error(`- ${file}`));
  }
  process.exitCode = 1;
} else {
  console.log(`[architecture] passed (${files.length} frontend source files checked)`);
}
