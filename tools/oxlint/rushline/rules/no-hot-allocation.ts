import path from "node:path";

import { defineRule } from "@oxlint/plugins";
import type { ESTree } from "@oxlint/plugins";
import * as Schema from "effect/Schema";

const decodeOptions = Schema.decodeUnknownSync(
  Schema.Tuple([
    Schema.Struct({
      bodies: Schema.Record(
        Schema.String,
        Schema.Array(Schema.Array(Schema.String))
      ),
    }),
  ])
);

type FunctionNode = ESTree.ArrowFunctionExpression | ESTree.Function;

interface Frame {
  readonly hot: boolean;
  readonly node: FunctionNode;
  readonly path: string;
}

const calleeName = (callee: ESTree.Node): string | null => {
  if (callee.type === "Identifier") {
    return callee.name;
  }
  if (
    callee.type === "MemberExpression" &&
    !callee.computed &&
    callee.property.type === "Identifier"
  ) {
    return callee.property.name;
  }
  return null;
};

const keyName = (key: ESTree.Node): string | null =>
  key.type === "Identifier" ? key.name : null;

const segmentOf = (node: FunctionNode): string => {
  if (node.type === "FunctionDeclaration" && node.id) {
    return node.id.name;
  }
  const { parent } = node;
  if (
    parent.type === "VariableDeclarator" &&
    parent.init === node &&
    parent.id.type === "Identifier"
  ) {
    return parent.id.name;
  }
  if (
    (parent.type === "Property" || parent.type === "MethodDefinition") &&
    parent.value === node
  ) {
    return keyName(parent.key) ?? "?";
  }
  if (parent.type === "CallExpression" && parent.callee !== node) {
    const name = calleeName(parent.callee);
    return name === null ? "?" : `${name}()`;
  }
  return "?";
};

const describeKind = {
  array: "an array literal",
  closure: "a function",
  instance: "an instance with `new`",
  object: "an object literal",
  rest: "a rest container",
  spread: "a spread copy",
  view: "a typed-array view with `subarray`",
} as const;

type Kind = keyof typeof describeKind;

export const noHotAllocationRule = defineRule({
  create(context) {
    const [{ bodies }] = decodeOptions(context.options);
    const file = path
      .relative(context.cwd, context.filename)
      .split(path.sep)
      .join("/");
    const expected = (bodies[file] ?? []).map((body) => body.join(" > "));
    const wanted = new Set(expected);
    const found = new Map<string, number>();
    const frames: Frame[] = [];

    const report = (node: ESTree.Node, kind: Kind) => {
      const frame = frames.at(-1);
      if (frame?.hot === true) {
        context.report({
          data: { body: frame.path, kind: describeKind[kind] },
          messageId: "allocation",
          node,
        });
      }
    };

    const enter = (node: FunctionNode) => {
      report(node, "closure");
      const outer = frames.at(-1);
      const segment = segmentOf(node);
      const place = outer ? `${outer.path} > ${segment}` : segment;
      const hot = wanted.has(place);
      if (hot) {
        found.set(place, (found.get(place) ?? 0) + 1);
      }
      frames.push({ hot, node, path: place });
    };

    const leave = () => {
      frames.pop();
    };

    return {
      ArrayExpression(node) {
        report(node, "array");
      },
      ArrowFunctionExpression: enter,
      "ArrowFunctionExpression:exit": leave,
      CallExpression(node) {
        if (calleeName(node.callee) === "subarray") {
          report(node, "view");
        }
      },
      FunctionDeclaration: enter,
      "FunctionDeclaration:exit": leave,
      FunctionExpression: enter,
      "FunctionExpression:exit": leave,
      NewExpression(node) {
        report(node, "instance");
      },
      ObjectExpression(node) {
        report(node, "object");
      },
      "Program:exit"(node) {
        if (expected.length === 0) {
          context.report({ data: { file }, messageId: "noBodies", node });
        }
        for (const body of expected) {
          const count = found.get(body) ?? 0;
          if (count !== 1) {
            context.report({
              data: { body, count: String(count) },
              messageId: count === 0 ? "missingBody" : "duplicateBody",
              node,
            });
          }
        }
      },
      RestElement(node) {
        report(node, "rest");
      },
      SpreadElement(node) {
        report(node, "spread");
      },
    };
  },
  meta: {
    docs: {
      description:
        "Keep the named tick, frame, planner and input bodies free of direct allocation syntax.",
    },
    messages: {
      allocation:
        "{{body}} runs every tick or frame and builds {{kind}} here. Reuse a buffer or record made at setup, or move the work out of the repeated body.",
      duplicateBody:
        "{{body}} is defined {{count}} times. Each hot body in oxlint.config.ts must name exactly one function.",
      missingBody:
        "{{body}} is listed as a hot body in oxlint.config.ts but this file does not define it. Update the hot body table with the function's new name or owner.",
      noBodies:
        "{{file}} is a hot file with no hot bodies in oxlint.config.ts. Name its repeated bodies there.",
    },
    schema: [
      {
        additionalProperties: false,
        properties: {
          bodies: {
            additionalProperties: {
              items: { items: { type: "string" }, type: "array" },
              type: "array",
            },
            type: "object",
          },
        },
        required: ["bodies"],
        type: "object",
      },
    ],
    type: "problem",
  },
});
