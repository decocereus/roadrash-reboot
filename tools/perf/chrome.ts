import { spawn } from "node:child_process";
import { once } from "node:events";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { setTimeout as sleep } from "node:timers/promises";

import { Schema } from "effect";

import { connect } from "./cdp.ts";
import type { Session } from "./cdp.ts";

export const CHROME =
  "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";

const STARTUP_ATTEMPTS = 150;
const STARTUP_POLL_MS = 100;

export interface Viewport {
  readonly width: number;
  readonly height: number;
  readonly scale: number;
}

export interface Browser {
  readonly page: Session;
  readonly close: () => Promise<void>;
}

const targetList = Schema.Array(
  Schema.Struct({
    type: Schema.String,
    webSocketDebuggerUrl: Schema.optionalKey(Schema.String),
  })
);

export const chromeFlags = (
  port: number,
  profile: string,
  viewport: Viewport
): string[] => [
  "--headless=new",
  `--user-data-dir=${profile}`,
  `--remote-debugging-port=${port}`,
  `--force-device-scale-factor=${viewport.scale}`,
  `--window-size=${viewport.width},${viewport.height}`,
  "--disable-gpu-vsync",
  "--disable-frame-rate-limit",
  "--use-angle=metal",
  "--enable-gpu",
  "--ignore-gpu-blocklist",
  "--no-first-run",
  "--no-default-browser-check",
  "--mute-audio",
  "--disable-background-timer-throttling",
  "--disable-renderer-backgrounding",
  "--disable-backgrounding-occluded-windows",
  "--disable-extensions",
  "about:blank",
];

const pageTarget = async (port: number): Promise<string | undefined> => {
  try {
    const response = await fetch(`http://127.0.0.1:${port}/json/list`);
    const listed = Schema.decodeUnknownSync(targetList)(await response.json());
    return listed.find((target) => target.type === "page")
      ?.webSocketDebuggerUrl;
  } catch {
    return undefined;
  }
};

const pageSocket = async (port: number, attempt: number): Promise<string> => {
  if (attempt >= STARTUP_ATTEMPTS) {
    throw new Error(`Chrome did not open DevTools on port ${port}.`);
  }
  await sleep(STARTUP_POLL_MS);
  const page = await pageTarget(port);
  return page ?? pageSocket(port, attempt + 1);
};

const portInUse = async (port: number): Promise<boolean> => {
  try {
    await fetch(`http://127.0.0.1:${port}/json/version`);
    return true;
  } catch {
    return false;
  }
};

export const launch = async (
  port: number,
  viewport: Viewport
): Promise<Browser> => {
  if (await portInUse(port)) {
    throw new Error(`Port ${port} already answers; pick another with --port.`);
  }
  const profile = await mkdtemp(path.join(tmpdir(), "rushline-perf-"));
  const child = spawn(CHROME, chromeFlags(port, profile, viewport), {
    stdio: "ignore",
  });
  const exited = once(child, "exit");
  const page = await connect(await pageSocket(port, 0));
  return {
    async close() {
      page.close();
      child.kill("SIGTERM");
      await exited;
      await rm(profile, { force: true, recursive: true });
    },
    page,
  };
};
