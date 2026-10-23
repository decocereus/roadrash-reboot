import { defineRule } from "@oxlint/plugins";

const lintDirective =
  /^(?:eslint|oxlint)-disable(?:-next-line|-line)?(?=\s|$)/u;
const lintReason = /\s--\s*\S/u;
const bannedTypeDirective = /^@ts-(?:ignore|nocheck)\b/u;
const expectError = /^@ts-expect-error(?<rest>.*)$/su;

const directiveText = (value: string) =>
  value
    .split("\n")
    .map((line) => line.replace(/^\s*\*?\s?/u, ""))
    .join("\n")
    .trim();

export const requireSuppressionReasonRule = defineRule({
  create(context) {
    return {
      Program() {
        for (const comment of context.sourceCode.getAllComments()) {
          const text = directiveText(comment.value);
          if (lintDirective.test(text) && !lintReason.test(text)) {
            context.report({ loc: comment.loc, messageId: "lintReason" });
          }
          if (bannedTypeDirective.test(text)) {
            context.report({
              loc: comment.loc,
              messageId: "bannedTypeDirective",
            });
          }
          const expected = expectError.exec(text)?.groups?.rest;
          if (
            expected !== undefined &&
            expected.replace(/^\s*--/u, "").trim() === ""
          ) {
            context.report({
              loc: comment.loc,
              messageId: "expectErrorReason",
            });
          }
        }
      },
    };
  },
  meta: {
    docs: {
      description:
        "Require a reason on every lint suppression and @ts-expect-error, and ban @ts-ignore and @ts-nocheck.",
    },
    messages: {
      bannedTypeDirective:
        "`@ts-ignore` and `@ts-nocheck` hide every error. Use `@ts-expect-error -- reason` on the one line that needs it.",
      expectErrorReason:
        "Say why this `@ts-expect-error` is needed: `@ts-expect-error -- reason`.",
      lintReason:
        "Say why this rule is suppressed: `oxlint-disable-next-line rule -- reason`.",
    },
    type: "problem",
  },
});
