import { existsSync, readdirSync, readFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { spawnSync } from "node:child_process";

const root = resolve(import.meta.dirname, "..");
const scriptName = process.argv[2];

if (!scriptName) {
  console.error("Usage: node scripts/run-workspaces.mjs <script>");
  process.exit(2);
}

const workspaceRoots = ["apps", "packages", "infra"];
const workspaceDirs = workspaceRoots.flatMap((rootName) => {
  const absoluteRoot = join(root, rootName);
  if (!existsSync(absoluteRoot)) return [];
  return readdirSync(absoluteRoot, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => join(absoluteRoot, entry.name));
});

const workspaces = workspaceDirs
  .filter((workspace) => existsSync(join(workspace, "package.json")))
  .map((workspace) => ({
    path: workspace,
    manifest: JSON.parse(readFileSync(join(workspace, "package.json"), "utf8")),
  }))
  .sort((left, right) => left.path.localeCompare(right.path));

let ran = 0;
let failed = false;

for (const workspace of workspaces) {
  if (!workspace.manifest.scripts?.[scriptName]) {
    console.log(`[workspaces] ${workspace.manifest.name}: no ${scriptName} script, skipped`);
    continue;
  }

  ran += 1;
  console.log(`[workspaces] ${workspace.manifest.name}: bun run ${scriptName}`);
  const result = spawnSync("bun", ["run", scriptName], {
    cwd: workspace.path,
    stdio: "inherit",
  });
  if (result.status !== 0) failed = true;
}

if (ran === 0) {
  console.log(`[workspaces] no workspace declared a ${scriptName} script`);
}

process.exitCode = failed ? 1 : 0;
