import { execFileSync, spawnSync } from "node:child_process";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

import { afterEach, describe, expect, it } from "vitest";

const script = path.join(import.meta.dirname, "check-rule-routes.ts");
const repositories: string[] = [];

const ruleTable = (...checks: readonly string[]) =>
  `| Rule | Check | Scope | Exemption |\n| --- | --- | --- | --- |\n${checks
    .map((check) => `| A rule. | ${check} | Repository | None |\n`)
    .join("")}`;

const agents = (rows: string) =>
  `# Guidance\n\n| Paths | Rules | Design |\n| --- | --- | --- |\n${rows}\n`;

const routedRepository = {
  "AGENTS.md": agents(
    "| `**` | `docs/core.md` | `docs/design.md` |\n| `src/**` | `docs/src.md` | None |"
  ),
  "docs/core.md": `# Core\n\n${ruleTable("`pnpm check:size`")}`,
  "docs/design.md": "# Design\n\nHow it is built.\n",
  "docs/src.md": `# Source\n\n${ruleTable("judgment", "`pnpm test`")}`,
  "package.json": JSON.stringify({
    scripts: { "check:size": "node size.ts", test: "vitest" },
  }),
  "scripts/rule-rows.json": JSON.stringify({
    "docs/core.md": 1,
    "docs/src.md": 2,
  }),
  "src/main.ts": "export const main = 1;\n",
};

const repository = (files: Readonly<Record<string, string>>) => {
  const dir = mkdtempSync(path.join(tmpdir(), "rushline-rule-routes-"));
  repositories.push(dir);
  execFileSync("git", ["init", "--quiet"], { cwd: dir });
  for (const [file, text] of Object.entries(files)) {
    mkdirSync(path.dirname(path.join(dir, file)), { recursive: true });
    writeFileSync(path.join(dir, file), text);
  }
  return dir;
};

const checkRoutes = (files: Readonly<Record<string, string>>) => {
  const result = spawnSync(process.execPath, [script], {
    cwd: repository(files),
    encoding: "utf-8",
  });
  return { status: result.status, stderr: result.stderr };
};

describe("check:rule-routes", () => {
  afterEach(() => {
    for (const dir of repositories.splice(0)) {
      rmSync(dir, { force: true, recursive: true });
    }
  });

  it("passes when every rule table is routed and every check script has a row", () => {
    expect(checkRoutes(routedRepository)).toStrictEqual({
      status: 0,
      stderr: "",
    });
  });

  it("fails a rule table in a doc no route lists under Rules", () => {
    const { status, stderr } = checkRoutes({
      ...routedRepository,
      "docs/stray.md": `# Stray\n\n${ruleTable("judgment")}`,
    });
    expect(status).toBe(1);
    expect(stderr).toContain(
      "docs/stray.md: holds 1 rule rows but no route in AGENTS.md lists it under Rules"
    );
  });

  it("fails a rule table hidden in a design doc", () => {
    const { status, stderr } = checkRoutes({
      ...routedRepository,
      "docs/design.md": `# Design\n\n${ruleTable("judgment")}`,
    });
    expect(status).toBe(1);
    expect(stderr).toContain("docs/design.md: holds 1 rule rows");
  });

  it("fails when the row naming a check script is dropped", () => {
    const { status, stderr } = checkRoutes({
      ...routedRepository,
      "docs/core.md": `# Core\n\n${ruleTable("judgment")}`,
    });
    expect(status).toBe(1);
    expect(stderr).toContain(
      "package.json: `pnpm check:size` is a check that no rule row names"
    );
  });

  it("fails a routed rule doc that is missing or holds no row", () => {
    const missing = checkRoutes({
      ...routedRepository,
      "docs/src.md": "# Source\n\nNo rules left.\n",
    });
    expect(missing.status).toBe(1);
    expect(missing.stderr).toContain(
      "`docs/src.md` is in the Rules column but holds no rule row"
    );
    const gone = checkRoutes(
      Object.fromEntries(
        Object.entries(routedRepository).filter(
          ([file]) => file !== "docs/src.md"
        )
      )
    );
    expect(gone.status).toBe(1);
    expect(gone.stderr).toContain(
      "AGENTS.md: the rule doc `docs/src.md` does not exist"
    );
  });

  it("fails a route whose paths match no file, or a missing design doc", () => {
    const { status, stderr } = checkRoutes({
      ...routedRepository,
      "AGENTS.md": agents(
        "| `**` | `docs/core.md` | `docs/gone.md` |\n| `lib/**` | `docs/src.md` | None |"
      ),
    });
    expect(status).toBe(1);
    expect(stderr).toContain("the route `lib/**` matches no file");
    expect(stderr).toContain("the design doc `docs/gone.md` does not exist");
  });

  it("fails a route table with no route for every change", () => {
    const { status, stderr } = checkRoutes({
      ...routedRepository,
      "AGENTS.md": agents(
        "| `docs/**` | `docs/core.md` | `docs/design.md` |\n| `src/**` | `docs/src.md` | None |"
      ),
    });
    expect(status).toBe(1);
    expect(stderr).toContain("no route sends `**` to a rule doc");
  });

  it("fails when a judgment row or a row sharing a check is deleted", () => {
    for (const kept of ["judgment", "`pnpm test`"]) {
      const { status, stderr } = checkRoutes({
        ...routedRepository,
        "docs/src.md": `# Source\n\n${ruleTable(kept)}`,
      });
      expect(status).toBe(1);
      expect(stderr).toContain(
        "docs/src.md: holds 1 rule rows but scripts/rule-rows.json records 2"
      );
    }
  });

  it("fails a global route whose Rules cell names no rule doc", () => {
    const { status, stderr } = checkRoutes({
      ...routedRepository,
      "AGENTS.md": agents(
        "| `**` | None | `docs/design.md` |\n| `src/**` | `docs/src.md`, `docs/core.md` | None |"
      ),
    });
    expect(status).toBe(1);
    expect(stderr).toContain("no route sends `**` to a rule doc");
  });
});
