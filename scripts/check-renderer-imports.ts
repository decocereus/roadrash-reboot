import { globSync } from "node:fs";
import path from "node:path";
import process from "node:process";

import {
  describeFinding,
  viteImportPorts,
  walkImports,
} from "./renderer-imports.ts";

const repository = path.resolve(import.meta.dirname, "..");
const web = path.join(repository, "apps/web");

const roots = globSync("src/**/*.tsx", { cwd: web })
  .toSorted()
  .map((file) => path.join(web, file));

const ports = await viteImportPorts(web, path.join(web, "vite.config.ts"));
const findings = await walkImports(roots, ports, path.join(web, "src/game"));

if (findings.length > 0) {
  process.stderr.write(
    `${findings
      .map((finding) => describeFinding(finding, repository))
      .toSorted()
      .join("\n\n")}\n`
  );
  process.exit(1);
}
process.stdout.write(
  `Renderer imports: ok (${roots.length} React roots reach no game implementation or three value)\n`
);
