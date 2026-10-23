import { execFileSync } from "node:child_process";
import { existsSync, writeFileSync } from "node:fs";
import process from "node:process";

import {
  LIST_FILES,
  MAP,
  renderFeatureMap,
  sourceFilesOf,
} from "./feature-map.ts";
import { features } from "./features.ts";

const files = sourceFilesOf(
  execFileSync("git", LIST_FILES, { encoding: "utf-8" }),
  existsSync
);

writeFileSync(MAP, renderFeatureMap(features, files));
process.stdout.write(
  `Feature map: wrote ${MAP} (${features.length} entries, ${files.length} source files)\n`
);
