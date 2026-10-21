import { spawn } from "node:child_process";
import type { SpawnOptionsWithoutStdio } from "node:child_process";
import { once } from "node:events";
import { text } from "node:stream/consumers";
import { setTimeout as sleep } from "node:timers/promises";

const POLL_MS = 200;
const STOP_ATTEMPTS = 50;

export interface CommandOutput {
  readonly stderr: string;
  readonly stdout: string;
}

export const run = async (
  file: string,
  args: readonly string[],
  options: SpawnOptionsWithoutStdio = {}
): Promise<CommandOutput> => {
  const child = spawn(file, args, options);
  const [stdout, stderr] = await Promise.all([
    text(child.stdout),
    text(child.stderr),
    once(child, "close"),
  ]);
  if (child.exitCode !== 0) {
    throw new Error(`Command failed: ${[file, ...args].join(" ")}\n${stderr}`);
  }
  return { stderr, stdout };
};

export const listenerOf = async (port: number): Promise<number | null> => {
  try {
    const { stdout } = await run("lsof", [
      "-nP",
      "-t",
      `-iTCP:${port}`,
      "-sTCP:LISTEN",
    ]);
    const [first] = stdout.split("\n").filter(Boolean).map(Number);
    return first ?? null;
  } catch {
    return null;
  }
};

export const alive = (pid: number | null): boolean => {
  if (pid === null) {
    return false;
  }
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
};

const commandOf = async (pid: number): Promise<string> => {
  try {
    const { stdout } = await run("ps", ["-o", "command=", "-p", String(pid)]);
    return stdout.trim();
  } catch {
    return "";
  }
};

const awaitGone = async (pid: number, attempt: number): Promise<boolean> => {
  if (!alive(pid)) {
    return true;
  }
  if (attempt >= STOP_ATTEMPTS) {
    return false;
  }
  await sleep(POLL_MS);
  return await awaitGone(pid, attempt + 1);
};

export const stopOwned = async (
  pid: number | null,
  expect: string
): Promise<string> => {
  if (pid === null || !alive(pid)) {
    return "already gone";
  }
  const command = await commandOf(pid);
  if (!command.includes(expect)) {
    return `left alone: pid ${pid} is now "${command.slice(0, 80)}", not ours`;
  }
  process.kill(pid, "SIGTERM");
  if (await awaitGone(pid, 0)) {
    return `stopped pid ${pid}`;
  }
  process.kill(pid, "SIGKILL");
  return `killed pid ${pid} after SIGTERM timed out`;
};
