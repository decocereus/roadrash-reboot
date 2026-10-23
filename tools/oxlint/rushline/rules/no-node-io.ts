import { defineRule } from "@oxlint/plugins";
import type { ESTree } from "@oxlint/plugins";

import { literalText } from "../property-name.ts";

const nodeIo = /^(?:node:)?(?:fs|child_process)(?:\/|$)/u;

export const noNodeIoRule = defineRule({
  create(context) {
    const check = (node: ESTree.Node, source: ESTree.Node | null) => {
      const text =
        source === null
          ? null
          : literalText(source, context.sourceCode.getText(source));
      if (text !== null && nodeIo.test(text)) {
        context.report({ data: { source: text }, messageId: "nodeIo", node });
      }
    };
    return {
      CallExpression(node) {
        if (
          node.callee.type === "Identifier" &&
          node.callee.name === "require"
        ) {
          check(node, node.arguments[0] ?? null);
        }
      },
      ExportAllDeclaration(node) {
        check(node, node.source);
      },
      ExportNamedDeclaration(node) {
        check(node, node.source);
      },
      ImportDeclaration(node) {
        check(node, node.source);
      },
      ImportExpression(node) {
        check(node, node.source);
      },
      TSExternalModuleReference(node) {
        check(node, node.expression);
      },
    };
  },
  meta: {
    docs: {
      description:
        "Disallow direct Node file system and process APIs in tool orchestration modules.",
    },
    messages: {
      nodeIo:
        "`{{source}}` is direct Node I/O. Use an Effect platform service: `FileSystem` for files, `ChildProcessSpawner` for processes.",
    },
    type: "problem",
  },
});
