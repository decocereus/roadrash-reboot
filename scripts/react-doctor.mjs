import { existsSync } from "node:fs";
import { join } from "node:path";
import { spawnSync } from "node:child_process";

const root = join(import.meta.dirname, "..");
const webPath = join(root, "apps/web");
if (!existsSync(webPath)) {
  console.log("[react-doctor] apps/web is not present, skipped");
  process.exit(0);
}

const result = spawnSync("react-doctor", ["--yes", "--no-score", "--verbose"], {
  cwd: webPath,
  stdio: "inherit",
});
process.exitCode = result.status ?? 1;
