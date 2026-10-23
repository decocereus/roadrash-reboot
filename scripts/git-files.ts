import { execFileSync } from "node:child_process";
import { existsSync } from "node:fs";
import path from "node:path";

export const repositoryFiles = (
  root: string,
  pathspecs: readonly string[] = []
): string[] =>
  execFileSync(
    "git",
    [
      "ls-files",
      "-z",
      "--cached",
      "--others",
      "--exclude-standard",
      "--",
      ...pathspecs,
    ],
    { cwd: root, encoding: "utf-8" }
  )
    .split("\0")
    .filter((file) => file !== "" && existsSync(path.join(root, file)));
