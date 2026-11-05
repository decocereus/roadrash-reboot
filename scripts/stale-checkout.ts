import { spawnSync } from "node:child_process";
import process from "node:process";

const git = (args: readonly string[], timeout: number) =>
  spawnSync("git", args, {
    encoding: "utf-8",
    env: {
      ...process.env,
      GIT_SSH_COMMAND:
        process.env.GIT_SSH_COMMAND ??
        "ssh -o BatchMode=yes -o ConnectTimeout=3",
      GIT_TERMINAL_PROMPT: "0",
    },
    timeout,
  });

const fetched =
  git(["fetch", "--quiet", "--no-tags", "origin", "main"], 4000).status === 0;
const count = git(["rev-list", "--count", "HEAD..origin/main"], 2000);
const behind = count.status === 0 ? Number(count.stdout.trim()) : 0;

if (behind > 0) {
  const commits = behind === 1 ? "1 commit" : `${behind} commits`;
  const source = fetched
    ? "origin/main"
    : "origin/main as of the last fetch, because fetching failed";
  const message = `This checkout is ${commits} behind ${source}. Merge or rebase onto origin/main before you build on, review or merge this branch.`;
  process.stdout.write(
    JSON.stringify({
      hookSpecificOutput: {
        additionalContext: message,
        hookEventName: "SessionStart",
      },
      systemMessage: message,
    })
  );
}
