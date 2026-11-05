import { execFileSync, spawnSync } from "node:child_process";
import { mkdtempSync, renameSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

import { afterEach, describe, expect, it } from "vitest";

const script = path.join(import.meta.dirname, "stale-checkout.ts");
const roots: string[] = [];

const git = (cwd: string, args: readonly string[]) =>
  execFileSync("git", args, {
    cwd,
    encoding: "utf-8",
    stdio: ["ignore", "pipe", "pipe"],
  });

const commit = (cwd: string, message: string) =>
  git(cwd, [
    "-c",
    "user.name=test",
    "-c",
    "user.email=test@example.invalid",
    "commit",
    "--quiet",
    "--allow-empty",
    "-m",
    message,
  ]);

const setup = () => {
  const root = mkdtempSync(path.join(tmpdir(), "rushline-stale-"));
  roots.push(root);
  const origin = path.join(root, "origin.git");
  const upstream = path.join(root, "upstream");
  const checkout = path.join(root, "checkout");
  git(root, ["init", "--quiet", "--bare", "--initial-branch=main", origin]);
  git(root, ["clone", "--quiet", origin, upstream]);
  commit(upstream, "first");
  git(upstream, ["push", "--quiet", "origin", "HEAD:main"]);
  git(root, ["clone", "--quiet", origin, checkout]);
  return { checkout, origin, upstream };
};

const advance = (upstream: string, commits: number) => {
  for (let made = 0; made < commits; made += 1) {
    commit(upstream, `next ${made}`);
  }
  git(upstream, ["push", "--quiet", "origin", "HEAD:main"]);
};

const runHook = (cwd: string) => {
  const started = Date.now();
  const result = spawnSync(process.execPath, [script], {
    cwd,
    encoding: "utf-8",
  });
  return {
    elapsedMs: Date.now() - started,
    status: result.status,
    stdout: result.stdout,
  };
};

const head = (cwd: string) => git(cwd, ["rev-parse", "HEAD"]).trim();

describe("stale-checkout hook", () => {
  afterEach(() => {
    for (const root of roots.splice(0)) {
      rmSync(root, { force: true, recursive: true });
    }
  });

  it("warns a checkout behind origin/main with the count, for the user and the agent", () => {
    const { checkout, upstream } = setup();
    advance(upstream, 5);
    const before = head(checkout);
    const result = runHook(checkout);
    const message =
      "This checkout is 5 commits behind origin/main. Merge or rebase onto origin/main before you build on, review or merge this branch.";
    expect(result.status).toBe(0);
    expect(JSON.parse(result.stdout)).toStrictEqual({
      hookSpecificOutput: {
        additionalContext: message,
        hookEventName: "SessionStart",
      },
      systemMessage: message,
    });
    expect(head(checkout)).toBe(before);
  });

  it("says nothing in a checkout that is current", () => {
    const { checkout } = setup();
    expect(runHook(checkout)).toMatchObject({ status: 0, stdout: "" });
  });

  it("falls back to the last fetch when origin cannot be reached, without failing", () => {
    const { checkout, origin, upstream } = setup();
    advance(upstream, 1);
    git(checkout, ["fetch", "--quiet", "origin"]);
    renameSync(origin, `${origin}.gone`);
    const result = runHook(checkout);
    expect(result.status).toBe(0);
    expect(JSON.parse(result.stdout)).toMatchObject({
      systemMessage:
        "This checkout is 1 commit behind origin/main as of the last fetch, because fetching failed. Merge or rebase onto origin/main before you build on, review or merge this branch.",
    });
    expect(result.elapsedMs).toBeLessThan(5000);
  });
});
