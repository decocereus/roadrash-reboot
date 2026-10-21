import { execFileSync } from "node:child_process";
import {
  mkdirSync,
  mkdtempSync,
  readFileSync,
  renameSync,
  rmSync,
  statSync,
} from "node:fs";
import path from "node:path";
import process from "node:process";

import * as Schema from "effect/Schema";

import { hasCode } from "./node-error.ts";

const root = path.resolve(import.meta.dirname, "..");
const referenceParent = path.join(root, ".references");
const referencePath = path.join(referenceParent, "effect");
const commit = "67ba4e46a11ccda0b6761578bfd22c04ae00167d";
const upstream = "https://github.com/Effect-TS/effect.git";

const git = (args: readonly string[], cwd = root) =>
  execFileSync("git", args, { cwd, encoding: "utf-8" }).trim();
const decodeProject = Schema.decodeUnknownSync(
  Schema.fromJsonString(
    Schema.Struct({ dependencies: Schema.Struct({ effect: Schema.String }) })
  )
);
const decodeVersion = Schema.decodeUnknownSync(
  Schema.fromJsonString(Schema.Struct({ version: Schema.String }))
);

const project = decodeProject(
  readFileSync(path.join(root, "package.json"), "utf-8")
);
const installed = decodeVersion(
  readFileSync(
    path.join(root, "node_modules", "effect", "package.json"),
    "utf-8"
  )
);
if (project.dependencies.effect !== installed.version) {
  throw new Error(
    `Install the project's pinned Effect version first: expected ${project.dependencies.effect}, found ${installed.version}.`
  );
}
if (git(["ls-files", "--", ".references/effect"]) !== "") {
  throw new Error(
    "Effect source is tracked by Rushline. Remove it from the index before continuing."
  );
}
git(["check-ignore", "-q", ".references/effect/"]);

const verify = (checkoutPath: string) => {
  const head = git(["rev-parse", "HEAD"], checkoutPath);
  const source = decodeVersion(
    readFileSync(
      path.join(checkoutPath, "packages", "effect", "package.json"),
      "utf-8"
    )
  );
  if (head !== commit || source.version !== installed.version) {
    throw new Error(
      `Effect reference mismatch: expected ${commit} at version ${installed.version}; found ${head} at version ${source.version}. Leave the checkout intact and inspect it manually.`
    );
  }
  if (git(["status", "--porcelain"], checkoutPath) !== "") {
    throw new Error(
      "Effect reference has local changes. Leave the checkout intact and inspect it manually."
    );
  }
};

const exists = (() => {
  try {
    statSync(referencePath);
    return true;
  } catch (error) {
    if (!hasCode(error, "ENOENT")) {
      throw error;
    }
    return false;
  }
})();

if (exists) {
  verify(referencePath);
} else {
  mkdirSync(referenceParent, { recursive: true });
  const temporary = mkdtempSync(
    path.join(referenceParent, ".effect-reference-")
  );
  try {
    const checkout = path.join(temporary, "source");
    git(["init", "--quiet", checkout]);
    git(["remote", "add", "origin", upstream], checkout);
    git(["fetch", "--depth=1", "origin", commit], checkout);
    git(["checkout", "--detach", "FETCH_HEAD"], checkout);
    verify(checkout);
    renameSync(checkout, referencePath);
  } finally {
    rmSync(temporary, { force: true, recursive: true });
  }
}

process.stdout.write(
  `Effect ${installed.version} reference is ready at .references/effect (${commit.slice(0, 12)}).\n`
);
