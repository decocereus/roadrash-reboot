import { defineRule } from "@oxlint/plugins";
import type { ESTree } from "@oxlint/plugins";

import { memberName } from "../property-name.ts";

const addressParts = new Set([
  "hash",
  "host",
  "hostname",
  "href",
  "pathname",
  "port",
  "protocol",
  "search",
]);

type Raw = (node: ESTree.Node) => string;

const isLocation = (node: ESTree.Node, raw: Raw): boolean => {
  if (node.type === "Identifier") {
    return node.name === "location";
  }
  return (
    node.type === "MemberExpression" && memberName(node, raw) === "location"
  );
};

const isHistory = (node: ESTree.Node, raw: Raw): boolean => {
  if (node.type === "Identifier") {
    return node.name === "history";
  }
  return (
    node.type === "MemberExpression" && memberName(node, raw) === "history"
  );
};

const isNamedLocation = (node: ESTree.Node): boolean =>
  node.type === "Identifier" && node.name === "location";

const renamesLocation = (pattern: ESTree.Node): boolean =>
  pattern.type === "ObjectPattern" &&
  pattern.properties.some(
    (each) =>
      each.type === "Property" &&
      isNamedLocation(each.key) &&
      !isNamedLocation(each.value)
  );

const movesThePage = (target: ESTree.Node, raw: Raw): boolean =>
  isLocation(target, raw) ||
  (target.type === "MemberExpression" &&
    isLocation(target.object, raw) &&
    addressParts.has(memberName(target, raw) ?? ""));

export const noPageMoveRule = defineRule({
  create(context) {
    const raw: Raw = (node) => context.sourceCode.getText(node);
    return {
      AssignmentExpression(node) {
        if (movesThePage(node.left, raw)) {
          context.report({ messageId: "load", node });
        }
      },
      CallExpression(node) {
        const { callee } = node;
        if (callee.type !== "MemberExpression") {
          return;
        }
        const name = memberName(callee, raw);
        if (
          (name === "assign" || name === "replace") &&
          isLocation(callee.object, raw)
        ) {
          context.report({ messageId: "load", node });
        } else if (name === "pushState" && isHistory(callee.object, raw)) {
          context.report({ messageId: "push", node });
        }
      },
      VariableDeclarator(node) {
        if (!node.init) {
          return;
        }
        const aliased = isLocation(node.init, raw) && !isNamedLocation(node.id);
        if (aliased || renamesLocation(node.id)) {
          context.report({ messageId: "alias", node });
        }
      },
    };
  },
  meta: {
    docs: {
      description:
        "Move between screens with stepNavigation, never by loading another address.",
    },
    messages: {
      alias:
        "This gives location another name, and a page load through that name would get past this rule. Read globalThis.location where it is used.",
      load: "This loads another address, which reloads the whole game and flashes the loading wordmark. Move between screens by sending stepNavigation an event; the address follows the view through showAddress in apps/web/src/components/room-url.ts.",
      push: "This adds a browser history entry that no screen answers, so Back would strand the rider. The address is written in place by showAddress in apps/web/src/components/room-url.ts.",
    },
    type: "problem",
  },
});
