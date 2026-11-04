import { spawn, spawnSync } from "node:child_process";
import { once } from "node:events";
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

import { afterAll, describe, expect, it, onTestFinished } from "vitest";

const root = path.resolve(import.meta.dirname, "../../..");
const cli = path.join(root, "tools/verify/rushline.ts");
const fixtures = path.join(import.meta.dirname, "fixtures");
const emptyTemp = mkdtempSync(path.join(tmpdir(), "rushline-cli-test-"));

const runCli = (
  args: readonly string[],
  env: Readonly<Record<string, string>> = {}
) => {
  const result = spawnSync(
    process.execPath,
    ["tools/verify/rushline.ts", ...args],
    {
      cwd: root,
      encoding: "utf-8",
      env: { ...process.env, TMPDIR: emptyTemp, ...env },
    }
  );
  return {
    status: result.status,
    stderr: result.stderr,
    stdout: result.stdout,
  };
};

describe("rv command line", () => {
  afterAll(() => {
    rmSync(emptyTemp, { force: true, recursive: true });
  });

  it.for([
    { args: ["help"], expected: "help.txt" },
    { args: [], expected: "help.txt" },
    { args: ["bogus"], expected: "help.txt" },
    { args: ["list"], expected: "list-empty.txt" },
  ])("prints $expected for rv $args", ({ args, expected }) => {
    expect(runCli(args)).toStrictEqual({
      status: 0,
      stderr: "",
      stdout: readFileSync(path.join(fixtures, expected), "utf-8"),
    });
  });

  it("fails loudly on a browser host setting outside the tuple", () => {
    const result = runCli(["list"], { RUSHLINE_BROWSER_HOST: "linux-amd" });
    expect(result.status).toBe(1);
    expect(result.stderr).toContain(
      "Unknown RUSHLINE_BROWSER_HOST=linux-amd; use macos-metal, linux-nvidia, linux-intel."
    );
  });
});

const benchTemp = () => {
  const temp = mkdtempSync(path.join(tmpdir(), "rushline-bench-cli-test-"));
  onTestFinished(() => {
    rmSync(temp, { force: true, recursive: true });
  });
  return temp;
};

describe("rv and another agent's work on the machine", () => {
  it.for(["up", "down"])(
    "rv desktop %s needs a name for its hold",
    (action) => {
      const result = runCli(["desktop", action]);
      expect(result.status).toBe(1);
      expect(result.stderr).toContain(`rv desktop ${action} <name>`);
    }
  );

  it("rv bench holds the lock for its command, gives it the exit code, and frees the lock", () => {
    const temp = benchTemp();
    const script =
      "const fs=require('node:fs');const claim=JSON.parse(fs.readFileSync(process.env.TMPDIR+'/rushline-verify/bench.lock','utf-8'));console.log(claim.label,String(claim.pid)===process.env.RUSHLINE_BENCH_PID);process.exit(3)";
    const result = runCli(
      ["bench", "campaign", "--", process.execPath, "-e", script],
      { TMPDIR: temp }
    );
    expect(result.stdout).toBe("campaign true\n");
    expect(result.status).toBe(3);
    expect(
      existsSync(path.join(temp, "rushline-verify", "bench.lock"))
    ).toBeFalsy();
  });

  it("rv open fails and names the bench while another process holds the lock", () => {
    const temp = benchTemp();
    const dir = path.join(temp, "rushline-verify");
    mkdirSync(dir);
    writeFileSync(
      path.join(dir, "bench.lock"),
      JSON.stringify({ label: "someone's campaign", pid: process.pid })
    );
    const result = runCli(["open", "--run", "x-s0", "/kit"], { TMPDIR: temp });
    expect(result.status).toBe(1);
    expect(result.stderr).toContain("someone's campaign");
  });
});

const OLD_RUN = "20261103-000000-s7";

const withOldSlotFile = (pids: {
  browserPid: number | null;
  upPid: number;
}) => {
  const temp = mkdtempSync(path.join(tmpdir(), "rushline-old-slot-test-"));
  const file = path.join(temp, "rushline-verify", "slot-7.json");
  mkdirSync(path.dirname(file));
  mkdirSync(path.join(temp, "evidence"));
  writeFileSync(
    file,
    JSON.stringify({
      ...pids,
      buildDir: null,
      builtAt: null,
      builtFrom: null,
      checkout: root,
      cpu: 1,
      devtoolsPort: 1,
      evidence: path.join(temp, "evidence"),
      network: "off",
      profile: path.join(temp, "profile"),
      run: OLD_RUN,
      serverMode: "external",
      serverPid: null,
      serverUrl: "http://127.0.0.1:1/",
      slot: 7,
      sound: false,
      startedAt: "2026-11-03T00:00:00.000Z",
      watcherPid: null,
    })
  );
  return { file, temp };
};

const runCliAsync = async (args: readonly string[], temp: string) => {
  const child = spawn(process.execPath, [cli, ...args], {
    env: { ...process.env, TMPDIR: temp },
    stdio: ["ignore", "pipe", "inherit"],
  });
  child.stdout.setEncoding("utf-8");
  let stdout = "";
  child.stdout.on("data", (chunk: string) => {
    stdout += chunk;
  });
  const closed: unknown[] = await once(child, "close");
  return { code: closed[0], stdout };
};

describe("a slot file written before hosts existed", () => {
  it("is reclaimed when its processes are dead", () => {
    const { file, temp } = withOldSlotFile({
      browserPid: null,
      upPid: 2 ** 30,
    });
    const result = spawnSync(process.execPath, [cli, "up", "--slot", "7"], {
      cwd: temp,
      encoding: "utf-8",
      env: { ...process.env, TMPDIR: temp },
    });
    const gone = !existsSync(file);
    rmSync(temp, { force: true, recursive: true });
    expect(result.stdout).toContain(`reclaimed stale slot of run ${OLD_RUN}`);
    expect(gone).toBeTruthy();
  });

  it("is listed as a macOS run and can be stopped when it is live", async () => {
    const browser = spawn(
      process.execPath,
      ["-e", "setInterval(() => {}, 1000)", "Helium"],
      { stdio: "ignore" }
    );
    onTestFinished(() => {
      browser.kill("SIGKILL");
    });
    const exited = once(browser, "exit");
    const { file, temp } = withOldSlotFile({
      browserPid: browser.pid ?? null,
      upPid: process.pid,
    });
    const listed = await runCliAsync(["list"], temp);
    const stopped = await runCliAsync(["down", "--run", OLD_RUN], temp);
    const exit: unknown[] = await exited;
    const gone = !existsSync(file);
    rmSync(temp, { force: true, recursive: true });
    expect(listed.stdout).toContain(
      `slot 7  run ${OLD_RUN}  http://127.0.0.1:1/  devtools 1  host macos-metal`
    );
    expect(stopped.code).toBe(0);
    expect(stopped.stdout).toContain(`browser: stopped pid ${browser.pid}`);
    expect(exit[1]).toBe("SIGTERM");
    expect(gone).toBeTruthy();
  });
});
