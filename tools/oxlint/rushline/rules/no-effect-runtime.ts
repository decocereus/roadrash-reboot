import { defineRule } from "@oxlint/plugins";
import type { ESTree } from "@oxlint/plugins";

import { memberName, moduleName } from "../property-name.ts";

const runMethod = /^run(?:Promise|Sync|Fork|Callback|Main)/u;
const runtimeNames = new Set(["ManagedRuntime", "NodeRuntime"]);
const runtimeModules = new Set([
  "@effect/platform-node/NodeRuntime",
  "effect/ManagedRuntime",
  "effect/Runtime",
]);
const effectModules = new Set(["effect", "effect/Effect", ...runtimeModules]);

const isRuntimeName = (name: string) =>
  runMethod.test(name) || runtimeNames.has(name);

const isEffectSource = (source: string) =>
  source.startsWith("effect") || source.startsWith("@effect/");

export const noEffectRuntimeRule = defineRule({
  create(context) {
    const raw = (node: ESTree.Node) => context.sourceCode.getText(node);
    const reportName = (node: ESTree.Node, name: string) => {
      if (isRuntimeName(name)) {
        context.report({ data: { name }, messageId: "runtime", node });
      }
    };
    const checkSource = (
      node: ESTree.Node,
      source: string,
      specifiers: readonly {
        readonly name: string;
        readonly node: ESTree.Node;
      }[]
    ) => {
      if (!isEffectSource(source)) {
        return;
      }
      if (runtimeModules.has(source)) {
        context.report({ data: { source }, messageId: "runtimeModule", node });
        return;
      }
      for (const specifier of specifiers) {
        reportName(specifier.node, specifier.name);
      }
    };
    return {
      ExportAllDeclaration(node) {
        if (effectModules.has(node.source.value)) {
          context.report({
            data: { source: node.source.value },
            messageId: "runtimeModule",
            node,
          });
        }
      },
      ExportNamedDeclaration(node) {
        if (node.source === null) {
          return;
        }
        checkSource(
          node,
          node.source.value,
          node.specifiers.map((specifier) => ({
            name: moduleName(specifier.local),
            node: specifier,
          }))
        );
      },
      ImportDeclaration(node) {
        checkSource(
          node,
          node.source.value,
          node.specifiers.flatMap((specifier) =>
            specifier.type === "ImportSpecifier"
              ? [{ name: moduleName(specifier.imported), node: specifier }]
              : []
          )
        );
      },
      MemberExpression(node) {
        const name = memberName(node, raw);
        if (name !== null) {
          reportName(node, name);
        }
      },
      Property(node) {
        if (
          node.parent.type === "ObjectPattern" &&
          node.key.type === "Identifier"
        ) {
          reportName(node, node.key.name);
        }
      },
    };
  },
  meta: {
    docs: {
      description:
        "Disallow running Effects or building runtimes, NodeRuntime included, outside entry points.",
    },
    messages: {
      runtime:
        "`{{name}}` runs an Effect outside an entry point. Return the Effect and let an entry run it: a tool entry such as `tools/verify/rushline.ts`, the `/api/telemetry` route, the browser uploader entry `uploader-runtime.ts`, the browser save entry `apps/web/src/career/save.ts`, or a test.",
      runtimeModule:
        "`{{source}}` builds a runtime. Library code returns Effects and leaves running them to the entry points.",
    },
    type: "problem",
  },
});
