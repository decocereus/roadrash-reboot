import { defineRule } from "@oxlint/plugins";
import type { Comment } from "@oxlint/plugins";

import { commentLines, safetyNotes } from "../notes.ts";

const directives = [
  /^(?:eslint|oxlint)-(?:disable|enable)(?:-next-line|-line)?(?=\s|$)/u,
  /^@ts-expect-error(?=\s|$)/u,
  /^[#@]__PURE__$/u,
  /^@vite-ignore$/u,
];

const tripleSlashReference = /^\/\s*<reference\s/u;

const isDirective = (comment: Comment) => {
  if (comment.type === "Shebang") {
    return true;
  }
  if (comment.type === "Line" && tripleSlashReference.test(comment.value)) {
    return true;
  }
  const first = commentLines(comment)[0] ?? "";
  return directives.some((directive) => directive.test(first));
};

export const noCommentsRule = defineRule({
  create(context) {
    return {
      Program() {
        const comments = context.sourceCode.getAllComments();
        const inNotes = new Set(
          safetyNotes(context.sourceCode.text, comments).flatMap(
            (note) => note.comments
          )
        );
        for (const comment of comments) {
          if (!inNotes.has(comment) && !isDirective(comment)) {
            context.report({ loc: comment.loc, messageId: "comment" });
          }
        }
      },
    };
  },
  meta: {
    docs: {
      description:
        "Ban comments other than lint suppressions, @ts-expect-error, SAFETY notes, and the directives tools read.",
    },
    messages: {
      comment:
        "Delete this comment. Carry the meaning in a name, a type or a small function, and put rationale in docs/ or the commit message.",
    },
    type: "suggestion",
  },
});
