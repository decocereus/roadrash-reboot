import { spawnSync } from "node:child_process";
import process from "node:process";

interface Check {
  readonly command: readonly [string, ...string[]];
  readonly name: string;
  readonly quick: boolean;
}

interface CheckResult {
  readonly command: string;
  readonly durationMs: number;
  readonly exitCode: number | null;
  readonly name: string;
  readonly ok: boolean;
  readonly output?: string;
}

const checks: readonly Check[] = [
  { command: ["pnpm", "format:check"], name: "format", quick: true },
  { command: ["pnpm", "lint"], name: "lint", quick: true },
  { command: ["pnpm", "lint:rules"], name: "lint rules", quick: true },
  { command: ["pnpm", "check:rules"], name: "rules", quick: true },
  {
    command: ["pnpm", "check:css-comments"],
    name: "css comments",
    quick: true,
  },
  {
    command: ["pnpm", "check:typescript-only"],
    name: "typescript only",
    quick: true,
  },
  { command: ["pnpm", "typecheck"], name: "typecheck", quick: true },
  { command: ["pnpm", "test"], name: "tests", quick: true },
  { command: ["pnpm", "build"], name: "build", quick: false },
];

const args = process.argv.slice(2);
const formatAt = args.indexOf("--format");
const asJson = formatAt !== -1 && args[formatAt + 1] === "json";
const quickOnly = args.includes("check");
const outputTail = 4000;

const selected = checks.filter((check) => check.quick || !quickOnly);

const runCheck = (check: Check): CheckResult => {
  const started = Date.now();
  const [program, ...rest] = check.command;
  if (!asJson) {
    process.stdout.write(`\n> ${check.name}: ${check.command.join(" ")}\n`);
    const { status } = spawnSync(program, rest, { stdio: "inherit" });
    return {
      command: check.command.join(" "),
      durationMs: Date.now() - started,
      exitCode: status,
      name: check.name,
      ok: status === 0,
    };
  }
  const result = spawnSync(program, rest, {
    encoding: "utf-8",
    maxBuffer: 256 * 1024 * 1024,
  });
  return {
    command: check.command.join(" "),
    durationMs: Date.now() - started,
    exitCode: result.status,
    name: check.name,
    ok: result.status === 0,
    output:
      result.status === 0
        ? ""
        : `${result.stdout}${result.stderr}`.slice(-outputTail),
  };
};

const seconds = (durationMs: number) => (durationMs / 1000).toFixed(1);

const started = Date.now();
const results = selected.map(runCheck);
const report = {
  checks: results,
  durationMs: Date.now() - started,
  ok: results.every((result) => result.ok),
};

if (asJson) {
  process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
} else {
  process.stdout.write("\n");
  for (const result of results) {
    process.stdout.write(
      `${result.ok ? "ok    " : "FAILED"} ${result.name} (${seconds(result.durationMs)} s)\n`
    );
  }
  process.stdout.write(
    report.ok
      ? `\nAll ${results.length} checks passed in ${seconds(report.durationMs)} s.\n`
      : `\n${results.filter((result) => !result.ok).length} of ${results.length} checks failed.\n`
  );
}

process.exitCode = report.ok ? 0 : 1;
