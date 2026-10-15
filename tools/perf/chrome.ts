import { execFile, spawn } from "node:child_process";
import { once } from "node:events";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { setTimeout as sleep } from "node:timers/promises";
import { promisify } from "node:util";

import { Schema } from "effect";

import { connect } from "./cdp.ts";
import type { Session } from "./cdp.ts";

export type BrowserName = "chrome" | "helium";

export interface BrowserChoice {
  readonly name: BrowserName;
  readonly app: string;
  readonly binary: string;
  readonly headless: boolean;
}

export const browsers = {
  chrome: {
    app: "/Applications/Google Chrome.app",
    binary: "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
    headless: true,
    name: "chrome",
  },
  helium: {
    app: "/Applications/Helium.app",
    binary: "/Applications/Helium.app/Contents/MacOS/Helium",
    headless: false,
    name: "helium",
  },
} satisfies Readonly<Record<BrowserName, BrowserChoice>>;

export const browserNamed = (name: string): BrowserChoice => {
  const found = Object.values(browsers).find((each) => each.name === name);
  if (!found) {
    throw new Error(`Unknown browser ${name}; use chrome or helium.`);
  }
  return found;
};

const STARTUP_ATTEMPTS = 150;
const STARTUP_POLL_MS = 100;

const run = promisify(execFile);

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
    url: Schema.String,
    webSocketDebuggerUrl: Schema.optionalKey(Schema.String),
  })
);

export const sharedFlags = (
  port: number,
  profile: string,
  viewport: Viewport
): string[] => [
  `--user-data-dir=${profile}`,
  `--remote-debugging-port=${port}`,
  `--window-size=${viewport.width},${viewport.height}`,
  "--use-angle=metal",
  "--enable-gpu",
  "--ignore-gpu-blocklist",
  "--no-first-run",
  "--no-default-browser-check",
  "--disable-background-timer-throttling",
  "--disable-renderer-backgrounding",
  "--disable-backgrounding-occluded-windows",
];

export const chromeFlags = (
  port: number,
  profile: string,
  viewport: Viewport,
  browser: BrowserChoice = browsers.chrome
): string[] => [
  ...(browser.headless ? ["--headless=new"] : []),
  ...sharedFlags(port, profile, viewport),
  `--force-device-scale-factor=${viewport.scale}`,
  "--disable-gpu-vsync",
  "--disable-frame-rate-limit",
  "--mute-audio",
  "--disable-extensions",
  "about:blank",
];

export const pageTarget = async (
  port: number,
  origin = ""
): Promise<string | undefined> => {
  try {
    const response = await fetch(`http://127.0.0.1:${port}/json/list`);
    const listed = Schema.decodeUnknownSync(targetList)(await response.json());
    return listed.find(
      (target) => target.type === "page" && target.url.startsWith(origin)
    )?.webSocketDebuggerUrl;
  } catch {
    return undefined;
  }
};

const pageSocket = async (port: number, attempt: number): Promise<string> => {
  if (attempt >= STARTUP_ATTEMPTS) {
    throw new Error(`The browser did not open DevTools on port ${port}.`);
  }
  await sleep(STARTUP_POLL_MS);
  const page = await pageTarget(port);
  return page ?? pageSocket(port, attempt + 1);
};

export const portAnswers = async (port: number): Promise<boolean> => {
  try {
    await fetch(`http://127.0.0.1:${port}/json/version`);
    return true;
  } catch {
    return false;
  }
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

const awaitListener = async (
  port: number,
  attempt: number
): Promise<number> => {
  if (attempt >= STARTUP_ATTEMPTS) {
    throw new Error(`Nothing started listening on port ${port}.`);
  }
  const pid = await listenerOf(port);
  if (pid !== null) {
    return pid;
  }
  await sleep(STARTUP_POLL_MS);
  return awaitListener(port, attempt + 1);
};

export const awaitPortClosed = async (
  port: number,
  attempt = 0
): Promise<boolean> => {
  if ((await listenerOf(port)) === null) {
    return true;
  }
  if (attempt >= STARTUP_ATTEMPTS) {
    return false;
  }
  await sleep(STARTUP_POLL_MS);
  return awaitPortClosed(port, attempt + 1);
};

export const startInBackground = async (
  browser: BrowserChoice,
  flags: readonly string[],
  port: number
): Promise<number> => {
  await run("open", ["-g", "-n", "-a", browser.app, "--args", ...flags]);
  return awaitListener(port, 0);
};

const launchHeadless = (
  browser: BrowserChoice,
  flags: readonly string[]
): (() => Promise<void>) => {
  const child = spawn(browser.binary, flags, { stdio: "ignore" });
  const exited = once(child, "exit");
  return async () => {
    child.kill("SIGTERM");
    await exited;
  };
};

const launchWindowed = async (
  browser: BrowserChoice,
  flags: readonly string[],
  port: number
): Promise<() => Promise<void>> => {
  const pid = await startInBackground(browser, flags, port);
  return async () => {
    process.kill(pid, "SIGTERM");
    await awaitPortClosed(port);
  };
};

export const launch = async (
  port: number,
  viewport: Viewport,
  browser: BrowserChoice = browsers.chrome
): Promise<Browser> => {
  if (await portAnswers(port)) {
    throw new Error(`Port ${port} already answers; pick another with --port.`);
  }
  const profile = await mkdtemp(path.join(tmpdir(), "rushline-perf-"));
  const flags = chromeFlags(port, profile, viewport, browser);
  const stop = browser.headless
    ? launchHeadless(browser, flags)
    : await launchWindowed(browser, flags, port);
  const page = await connect(await pageSocket(port, 0));
  return {
    async close() {
      page.close();
      await stop();
      await rm(profile, { force: true, recursive: true });
    },
    page,
  };
};
