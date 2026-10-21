import { spawn } from "node:child_process";
import { open } from "node:fs/promises";

export const spawnLogged = async (
  args: readonly string[],
  cwd: string,
  log: string,
  env: NodeJS.ProcessEnv
): Promise<number> => {
  const file = await open(log, "a");
  const child = spawn(process.execPath, [...args], {
    cwd,
    detached: true,
    env,
    stdio: ["ignore", file.fd, file.fd],
  });
  child.unref();
  await file.close();
  if (child.pid === undefined) {
    throw new Error(`Could not start ${args.join(" ")}.`);
  }
  return child.pid;
};
