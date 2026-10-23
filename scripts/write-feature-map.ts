import { writeFileSync } from "node:fs";
import process from "node:process";

import { MAP, renderFeatureMap, sourceFilesOf } from "./feature-map.ts";
import { features } from "./features.ts";
import { repositoryFiles } from "./git-files.ts";

const files = sourceFilesOf(repositoryFiles("."));

writeFileSync(MAP, renderFeatureMap(features, files));
process.stdout.write(
  `Feature map: wrote ${MAP} (${features.length} entries, ${files.length} source files)\n`
);
