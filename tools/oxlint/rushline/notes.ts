import type { Comment } from "@oxlint/plugins";

export interface SafetyNote {
  readonly comments: Comment[];
  readonly first: Comment;
}

export const commentLines = (comment: Comment): string[] =>
  comment.value
    .split("\n")
    .map((line) => line.replace(/^\s*\*?\s?/u, "").trim())
    .filter((line) => line !== "");

const continues = (text: string, previous: Comment, next: Comment) =>
  previous.type === "Line" &&
  next.type === "Line" &&
  /^[ \t]*\r?\n[ \t]*$/u.test(text.slice(previous.end, next.start));

export const safetyNotes = (
  text: string,
  comments: readonly Comment[]
): SafetyNote[] => {
  const notes: SafetyNote[] = [];
  let open: SafetyNote | null = null;
  let previous: Comment | null = null;
  for (const comment of comments) {
    if (
      open !== null &&
      previous !== null &&
      continues(text, previous, comment)
    ) {
      open.comments.push(comment);
    } else if (commentLines(comment)[0]?.startsWith("SAFETY:") === true) {
      open = { comments: [comment], first: comment };
      notes.push(open);
    } else {
      open = null;
    }
    previous = comment;
  }
  return notes;
};
