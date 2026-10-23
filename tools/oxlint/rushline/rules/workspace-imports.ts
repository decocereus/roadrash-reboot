import { existsSync, readFileSync } from "node:fs";
import path from "node:path";

import { defineRule } from "@oxlint/plugins";
import type { ESTree } from "@oxlint/plugins";
import * as Schema from "effect/Schema";

const Dependencies = Schema.optionalKey(
  Schema.Record(Schema.String, Schema.String)
);

const decodeManifest = Schema.decodeUnknownSync(
  Schema.fromJsonString(
    Schema.Struct({
      dependencies: Dependencies,
      devDependencies: Dependencies,
      name: Schema.optionalKey(Schema.String),
      peerDependencies: Dependencies,
    })
  )
);

interface Workspace {
  readonly declared: ReadonlySet<string>;
  readonly dir: string;
  readonly name: string | undefined;
}

const workspaceDirs = new Map<string, string>();
const workspaces = new Map<string, Workspace>();

const workspaceDirOf = (place: string): string => {
  const known = workspaceDirs.get(place);
  if (known !== undefined) {
    return known;
  }
  const parent = path.dirname(place);
  const found =
    existsSync(path.join(place, "package.json")) || parent === place
      ? place
      : workspaceDirOf(parent);
  workspaceDirs.set(place, found);
  return found;
};

const workspaceOf = (place: string): Workspace => {
  const dir = workspaceDirOf(place);
  const known = workspaces.get(dir);
  if (known !== undefined) {
    return known;
  }
  const manifest = decodeManifest(
    readFileSync(path.join(dir, "package.json"), "utf-8")
  );
  const workspace = {
    declared: new Set(
      [
        manifest.dependencies,
        manifest.devDependencies,
        manifest.peerDependencies,
      ].flatMap((dependencies) => Object.keys(dependencies ?? {}))
    ),
    dir,
    name: manifest.name,
  };
  workspaces.set(dir, workspace);
  return workspace;
};

const packageName = (specifier: string) =>
  specifier.split("/", specifier.startsWith("@") ? 2 : 1).join("/");

const isPath = (specifier: string) =>
  specifier.startsWith(".") || path.isAbsolute(specifier);

const quoted = /^(?<quote>["'`])(?<text>[^"'`$]*)\k<quote>$/u;

export const workspaceImportsRule = defineRule({
  create(context) {
    const from = workspaceOf(context.filename);
    const shown = (workspace: Workspace) => {
      const relative = path.relative(context.cwd, workspace.dir);
      return relative === "" ? "the root" : relative;
    };
    const manifest = path.relative(
      context.cwd,
      path.join(from.dir, "package.json")
    );
    const check = (node: ESTree.Node, source: string) => {
      if (isPath(source)) {
        const to = workspaceOf(
          path.resolve(path.dirname(context.filename), source)
        );
        if (to.dir !== from.dir) {
          context.report({
            data: {
              from: shown(from),
              manifest,
              source,
              target: to.name ?? shown(to),
              to: shown(to),
            },
            messageId: "crossesWorkspace",
            node,
          });
        }
        return;
      }
      const name = packageName(source);
      if (
        !source.startsWith("node:") &&
        name !== from.name &&
        !from.declared.has(name)
      ) {
        context.report({
          data: { manifest, name },
          messageId: "undeclared",
          node,
        });
      }
    };
    return {
      ExportAllDeclaration(node) {
        check(node, node.source.value);
      },
      ExportNamedDeclaration(node) {
        if (node.source !== null) {
          check(node, node.source.value);
        }
      },
      ImportDeclaration(node) {
        check(node, node.source.value);
      },
      ImportExpression(node) {
        const text = quoted.exec(context.sourceCode.getText(node.source))
          ?.groups?.text;
        if (text !== undefined) {
          check(node, text);
        }
      },
    };
  },
  meta: {
    docs: {
      description:
        "Keep every import inside its workspace or behind a package the workspace declares. A file's workspace is the folder of its nearest package.json.",
    },
    messages: {
      crossesWorkspace:
        "`{{source}}` leaves the {{from}} workspace for {{to}}. Import it by package name, {{target}}, and declare {{target}} in {{manifest}}.",
      undeclared:
        "`{{name}}` is not declared in {{manifest}}. Add it to that file's dependencies, devDependencies or peerDependencies.",
    },
    type: "problem",
  },
});
