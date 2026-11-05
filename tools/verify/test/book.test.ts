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
import { setTimeout as sleep } from "node:timers/promises";

import { OVERRUN_MS } from "@racer/devtools/bench-queue";
import { describe, expect, it, onTestFinished } from "vitest";

const root = path.resolve(import.meta.dirname, "../../..");
const cli = path.join(root, "tools/verify/rushline.ts");

const stateDir = () => {
  const temp = mkdtempSync(path.join(tmpdir(), "rushline-book-test-"));
  onTestFinished(() => {
    rmSync(temp, { force: true, recursive: true });
  });
  return temp;
};

const envFor = (
  temp: string,
  extra: Readonly<Record<string, string>> = {}
) => ({
  ...process.env,
  TMPDIR: temp,
  ...extra,
});

const rv = (temp: string, args: readonly string[]) =>
  spawnSync(process.execPath, [cli, ...args], {
    cwd: root,
    encoding: "utf-8",
    env: envFor(temp),
  });

const started = (
  temp: string,
  args: readonly string[],
  extra: Readonly<Record<string, string>> = {}
) => {
  const child = spawn(process.execPath, [cli, ...args], {
    cwd: root,
    env: envFor(temp, extra),
    stdio: ["ignore", "pipe", "pipe"],
  });
  onTestFinished(() => {
    child.kill("SIGKILL");
  });
  let output = "";
  child.stdout.setEncoding("utf-8");
  child.stderr.setEncoding("utf-8");
  child.stdout.on("data", (chunk: string) => {
    output += chunk;
  });
  child.stderr.on("data", (chunk: string) => {
    output += chunk;
  });
  const finished = async () => {
    const closed: unknown[] = await once(child, "close");
    return { code: closed[0], output };
  };
  return { child, finished: finished() };
};

const statusUntil = async (
  temp: string,
  text: string,
  attempts = 50
): Promise<string> => {
  const { stdout } = rv(temp, ["book", "status"]);
  if (stdout.includes(text) || attempts === 0) {
    return stdout;
  }
  await sleep(200);
  return await statusUntil(temp, text, attempts - 1);
};

const alive = (pid: number) => {
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
};

describe("rv book between two lanes", () => {
  it(
    "wakes a waiting lane on its own when the holder releases",
    { timeout: 30_000 },
    async () => {
      const temp = stateDir();
      rv(temp, ["book", "lane-a", "30", "frame", "campaign"]);
      expect(
        rv(temp, ["book", "lane-b", "20", "rooms", "check"]).stdout
      ).toContain("waiting  1. lane-b-2 for rooms check, 20 min");
      const waiter = started(temp, [
        "book",
        "wait",
        "lane-b-2",
        "--every",
        "1",
      ]);
      await sleep(3000);
      expect(waiter.child.exitCode).toBeNull();
      expect(rv(temp, ["book", "release", "lane-a-1"]).status).toBe(0);
      const { code, output } = await waiter.finished;
      expect(code).toBe(0);
      expect(output).toMatch(
        /lane-b-2: number 1 in line, lane-a-1 holds it[\s\S]*lane-b-2: your turn\./u
      );
    }
  );

  it(
    "gives the turn back to the lane as idle when its job's process dies",
    { timeout: 40_000 },
    async () => {
      const temp = stateDir();
      rv(temp, ["book", "lane-a", "30", "frame", "campaign"]);
      rv(temp, ["book", "lane-b", "20", "rooms", "check"]);
      const job = started(
        temp,
        [
          "bench",
          "campaign",
          "--",
          process.execPath,
          "-e",
          "const parent=process.ppid;setInterval(()=>{try{process.kill(parent,0)}catch{process.exit(0)}},200)",
        ],
        { RUSHLINE_BOOKING: "lane-a-1" }
      );
      await expect(statusUntil(temp, "running campaign")).resolves.toContain(
        `running campaign (pid ${job.child.pid}`
      );
      const holder = started(temp, [
        "book",
        "wait",
        "lane-a-1",
        "--every",
        "1",
      ]);
      await sleep(2000);
      expect(holder.child.exitCode).toBeNull();
      job.child.kill("SIGKILL");
      const woken = await holder.finished;
      expect(woken.code).toBe(0);
      expect(woken.output).toContain("lane-a-1: campaign ended;");
      expect(rv(temp, ["book", "status"]).stdout).toMatch(
        /lane-a-1 holds it for frame campaign, .*idle since[\s\S]*waiting {2}1\. lane-b-2/u
      );
    }
  );

  it(
    "keeps the turn busy while a job's workload outlives its killed rv bench",
    { timeout: 40_000 },
    async () => {
      const temp = stateDir();
      rv(temp, ["book", "lane-a", "30", "frame", "campaign"]);
      const pidFile = path.join(temp, "workload.pid");
      const job = started(
        temp,
        [
          "bench",
          "campaign",
          "--",
          process.execPath,
          "-e",
          "require('node:fs').writeFileSync(process.env.WORKLOAD_PID,String(process.pid));setTimeout(()=>{},60000)",
        ],
        { RUSHLINE_BOOKING: "lane-a-1", WORKLOAD_PID: pidFile }
      );
      await expect(statusUntil(temp, "running campaign")).resolves.toContain(
        `running campaign (pid ${job.child.pid}`
      );
      await expect.poll(() => existsSync(pidFile)).toBeTruthy();
      const workload = Number(readFileSync(pidFile, "utf-8"));
      onTestFinished(() => {
        if (alive(workload)) {
          process.kill(workload, "SIGKILL");
        }
      });
      const wrapper = job.child.pid ?? 0;
      job.child.kill("SIGKILL");
      await expect.poll(() => alive(wrapper)).toBeFalsy();
      expect(alive(workload)).toBeTruthy();
      expect(rv(temp, ["book", "status"]).stdout).toContain("running campaign");
      process.kill(workload, "SIGKILL");
      await expect(statusUntil(temp, "idle since")).resolves.toMatch(
        /lane-a-1 holds it for frame campaign, .*idle since/u
      );
    }
  );

  it(
    "wakes a parent waiting with --end and the next lane when the holder releases",
    { timeout: 30_000 },
    async () => {
      const temp = stateDir();
      rv(temp, ["book", "lane-a", "30", "frame", "campaign"]);
      rv(temp, ["book", "lane-b", "20", "rooms", "check"]);
      const ending = started(temp, [
        "book",
        "wait",
        "lane-a-1",
        "--end",
        "--every",
        "1",
      ]);
      const next = started(temp, ["book", "wait", "lane-b-2", "--every", "1"]);
      await sleep(2000);
      expect(ending.child.exitCode).toBeNull();
      expect(rv(temp, ["book", "release", "lane-a-1"]).status).toBe(0);
      const [ended, turn] = await Promise.all([ending.finished, next.finished]);
      expect([ended.code, turn.code]).toStrictEqual([0, 0]);
      expect(ended.output).toContain("lane-a-1 (frame campaign) ended at");
      expect(turn.output).toContain("lane-b-2: your turn.");
    }
  );

  it(
    "stops a bench's command when its booking runs out, and the turn passes on",
    { timeout: 30_000 },
    async () => {
      const temp = stateDir();
      const dir = path.join(temp, "rushline-verify");
      mkdirSync(dir);
      const now = Date.now();
      writeFileSync(
        path.join(dir, "bench-queue.json"),
        JSON.stringify({
          ended: [],
          holder: {
            booking: {
              bookedAt: now,
              id: "lane-a-1",
              lane: "lane-a",
              minutes: 1,
              owner: { kind: "lane" },
              purpose: "short job",
            },
            since: now - 60_000 - OVERRUN_MS + 5000,
            use: { kind: "idle", since: now },
          },
          next: 2,
          waiting: [],
        })
      );
      const pidFile = path.join(temp, "sleeper.pid");
      const job = started(
        temp,
        [
          "bench",
          "timed",
          "--",
          process.execPath,
          "-e",
          "process.on('SIGTERM',()=>{});require('node:fs').writeFileSync(process.env.SLEEPER_PID,String(process.pid));setTimeout(()=>{},60000)",
        ],
        { RUSHLINE_BOOKING: "lane-a-1", SLEEPER_PID: pidFile }
      );
      const { code, output } = await job.finished;
      expect(code).not.toBe(0);
      expect(output).toMatch(
        /timed: stopped at [\d:]+, because its booking ran out/u
      );
      expect(alive(Number(readFileSync(pidFile, "utf-8")))).toBeFalsy();
      expect(rv(temp, ["book", "status"]).stdout).toMatch(
        /free {5}nobody holds it and nobody waits[\s\S]*by more than 15 min/u
      );
    }
  );

  it("refuses a booking it cannot read and an unknown id", () => {
    const temp = stateDir();
    const refused = rv(temp, ["book", "Lane A", "30", "work"]);
    expect(refused.status).toBe(1);
    expect(refused.stderr).toContain("A lane is lower case letters");
    const waited = rv(temp, ["book", "wait", "nobody-7", "--every", "1"]);
    expect(waited.status).toBe(1);
    expect(waited.stdout).toContain("nobody-7: no such booking.");
  });
});
