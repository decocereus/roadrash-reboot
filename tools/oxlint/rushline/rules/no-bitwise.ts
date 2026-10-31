import path from "node:path";

import { defineRule } from "@oxlint/plugins";
import * as Schema from "effect/Schema";

const decodeOptions = Schema.decodeUnknownSync(
  Schema.Tuple([Schema.Struct({ words: Schema.Array(Schema.String) })])
);

const operators = new Set([
  "&",
  "|",
  "^",
  "<<",
  ">>",
  ">>>",
  "&=",
  "|=",
  "^=",
  "<<=",
  ">>=",
  ">>>=",
]);

const slashed = (file: string) => file.split(path.sep).join("/");

export const noBitwiseRule = defineRule({
  create(context) {
    const [{ words }] = decodeOptions(context.options);
    const allowed = new Set(words);
    const file = slashed(path.relative(context.cwd, context.filename));
    if (allowed.has(file)) {
      return {};
    }
    return {
      AssignmentExpression(node) {
        if (operators.has(node.operator)) {
          context.report({
            data: { operator: node.operator },
            messageId: "bitwise",
            node,
          });
        }
      },
      BinaryExpression(node) {
        if (operators.has(node.operator)) {
          context.report({
            data: { operator: node.operator },
            messageId: "bitwise",
            node,
          });
        }
      },
      UnaryExpression(node) {
        if (node.operator === "~") {
          context.report({
            data: { operator: node.operator },
            messageId: "bitwise",
            node,
          });
        }
      },
    };
  },
  meta: {
    docs: {
      description:
        "Disallow bitwise operators outside the word-mixing modules that declare them.",
    },
    messages: {
      bitwise:
        "`{{operator}}` coerces its operands to 32-bit integers, which hides a wrong number instead of failing. Work in numbers, or move the word mixing into a module this rule lists.",
    },
    schema: [
      {
        additionalProperties: false,
        properties: {
          words: { items: { type: "string" }, type: "array" },
        },
        required: ["words"],
        type: "object",
      },
    ],
    type: "problem",
  },
});
