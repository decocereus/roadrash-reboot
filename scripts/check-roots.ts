import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import process from "node:process";

const roots = new Set(["apps", "packages", "tools", "scripts", "docs"]);
const workspaceParents = new Set(["apps", "packages", "tools"]);

const workspaceGlobs = (
  /^packages:\n(?<list>(?:[ \t]+- .+\n)+)/mu.exec(
    readFileSync("pnpm-workspace.yaml", "utf-8")
  )?.groups?.list ?? ""
)
  .split("\n")
  .map((line) => line.replace(/^[ \t]+- /u, "").trim())
  .filter((glob) => glob !== "");

const files = execFileSync(
  "git",
  ["ls-files", "--cached", "--others", "--exclude-standard"],
  { encoding: "utf-8" }
)
  .split("\n")
  .filter((file) => file !== "");

const fileSet = new Set(files);

const directoriesAt = (depth: number) => [
  ...new Set(
    files
      .map((file) => file.split("/"))
      .filter((parts) => parts.length > depth)
      .map((parts) => parts.slice(0, depth).join("/"))
  ),
];

const matches = (glob: string, dir: string) =>
  glob.endsWith("/*")
    ? dir.split("/").length === 2 && dir.startsWith(glob.slice(0, -1))
    : dir === glob;

const topLevel = directoriesAt(1).filter((dir) => !dir.startsWith("."));
const workspaceFolders = directoriesAt(2).filter((dir) =>
  workspaceParents.has(dir.split("/")[0] ?? "")
);
const globbed = [...directoriesAt(1), ...directoriesAt(2)].filter((dir) =>
  workspaceGlobs.some((glob) => matches(glob, dir))
);

const errors = [
  ...topLevel
    .filter((dir) => !roots.has(dir))
    .map(
      (dir) =>
        `${dir}/: not a repository root folder; put apps in apps/, shared code in packages/, automation in tools/ or scripts/, and docs in docs/`
    ),
  ...[...new Set([...workspaceFolders, ...globbed])]
    .filter((dir) => !fileSet.has(`${dir}/package.json`))
    .map(
      (dir) =>
        `${dir}/: a workspace folder with no package.json; every folder under apps/, packages/ and tools/ is a workspace, so add ${dir}/package.json`
    ),
  ...workspaceFolders
    .filter((dir) => !globbed.includes(dir))
    .map(
      (dir) =>
        `${dir}/: not matched by any pnpm-workspace.yaml glob; list its parent folder there`
    ),
];

if (errors.length > 0) {
  process.stderr.write(`${errors.join("\n")}\n`);
  process.exit(1);
}
process.stdout.write(
  `Roots: ok (${topLevel.length} root folders, ${workspaceFolders.length} workspaces)\n`
);
