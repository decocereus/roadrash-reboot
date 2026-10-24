import { defineRule } from "@oxlint/plugins";
import type { ESTree } from "@oxlint/plugins";

import { memberName } from "../property-name.ts";

const distanceMethods = new Set([
  "distanceTo",
  "distanceToPoint",
  "distanceToSquared",
  "length",
  "lengthSq",
  "manhattanDistanceTo",
  "manhattanLength",
]);
const mathDistances = new Set(["hypot", "sqrt"]);

interface Write {
  readonly node: ESTree.Node;
  readonly values: readonly ESTree.Node[];
}

const decisionsAbove = (node: ESTree.Node): ESTree.Node[] => {
  const decisions: ESTree.Node[] = [];
  let child = node;
  for (let current = node.parent; current !== null; current = current.parent) {
    if (
      (current.type === "IfStatement" ||
        current.type === "ConditionalExpression") &&
      child !== current.test
    ) {
      decisions.push(current.test);
    } else if (
      current.type === "LogicalExpression" &&
      child === current.right
    ) {
      decisions.push(current.left);
    } else if (
      current.type === "WhileStatement" ||
      current.type === "DoWhileStatement"
    ) {
      decisions.push(current.test);
    } else if (
      (current.type === "ForStatement" || current.type === "SwitchCase") &&
      current.test !== null
    ) {
      decisions.push(current.test);
    } else if (current.type === "SwitchStatement") {
      decisions.push(current.discriminant);
    }
    child = current;
  }
  return decisions;
};

const inside = (node: ESTree.Node, root: ESTree.Node): boolean => {
  for (
    let current: ESTree.Node | null = node;
    current !== null;
    current = current.parent
  ) {
    if (current === root) {
      return true;
    }
  }
  return false;
};

export const noDistanceHideRule = defineRule({
  create(context) {
    const raw = (node: ESTree.Node) => context.sourceCode.getText(node);
    const distances: ESTree.CallExpression[] = [];
    const writes: Write[] = [];
    return {
      AssignmentExpression(node) {
        if (
          node.left.type === "MemberExpression" &&
          memberName(node.left, raw) === "visible"
        ) {
          writes.push({ node, values: [node.right] });
        }
      },
      CallExpression(node) {
        const { callee } = node;
        if (callee.type !== "MemberExpression") {
          return;
        }
        const name = memberName(callee, raw) ?? "";
        if (name === "setMatrixAt") {
          writes.push({ node, values: node.arguments });
        } else if (
          distanceMethods.has(name) ||
          (mathDistances.has(name) &&
            callee.object.type === "Identifier" &&
            callee.object.name === "Math")
        ) {
          distances.push(node);
        }
      },
      "Program:exit"() {
        for (const write of writes) {
          const decisions = [...write.values, ...decisionsAbove(write.node)];
          if (
            distances.some((distance) =>
              decisions.some((decision) => inside(distance, decision))
            )
          ) {
            context.report({ messageId: "distance", node: write.node });
          }
        }
      },
    };
  },
  meta: {
    docs: {
      description:
        "Hide scenery from the chase camera only through the world's clearance.",
    },
    messages: {
      distance:
        "This hides or shows scenery by a distance worked out here. Scenery the chase camera can reach joins the world's clearance in apps/web/src/game/clearance.ts, through `plant` or `addObject`, so there is one clearance distance and one decision.",
    },
    type: "problem",
  },
});
